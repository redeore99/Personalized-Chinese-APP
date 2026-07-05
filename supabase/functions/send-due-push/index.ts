// send-due-push — daily "cards due" Web Push sender.
//
// Invoked two ways:
//  1. pg_cron (daily): POST with header `x-cron-secret` matching public.push_private.cron_secret
//  2. The app's "Send Test Push" button: POST with the signed-in user's JWT
//     (the user must match app_config.allowed_email)
//
// Deployed with verify_jwt=false because the cron path authenticates with the
// shared secret; both paths are strictly checked below.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret'
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = createClient(supabaseUrl, serviceKey)

    // Load push config (service role only — RLS blocks everyone else)
    const { data: config, error: configError } = await service
      .from('push_private')
      .select('vapid_public, vapid_private, cron_secret')
      .limit(1)
      .single()

    if (configError || !config) {
      return jsonResponse({ error: 'Push is not configured (push_private is empty).' }, 500)
    }

    const { data: appConfig } = await service
      .from('app_config')
      .select('allowed_email')
      .limit(1)
      .single()

    const allowedEmail = (appConfig?.allowed_email || '').trim().toLowerCase()

    // ---- Authenticate the caller ----
    const cronSecret = req.headers.get('x-cron-secret')
    let isCron = false
    let isTest = false

    if (cronSecret && cronSecret === config.cron_secret) {
      isCron = true
    } else {
      const authHeader = req.headers.get('Authorization') || ''
      if (!authHeader.startsWith('Bearer ')) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }

      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } }
      })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      const email = (userData?.user?.email || '').trim().toLowerCase()

      if (userError || !email || !allowedEmail || email !== allowedEmail) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }

      isTest = true
    }

    // ---- Work out what to send ----
    const { count: dueCount } = await service
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('suspended', false)
      .lte('next_review', new Date().toISOString())

    const due = dueCount ?? 0

    if (isCron && due === 0) {
      return jsonResponse({ skipped: true, reason: 'Nothing due today.' })
    }

    const title = isTest ? '汉字学习 · Test' : '汉字学习 · 该复习啦'
    const body = isTest
      ? 'Push notifications are working on this device.'
      : due > 50
        ? `Your daily session is ready — ${due} cards in the queue, ~10 min gets you 20.`
        : `${due} card${due === 1 ? '' : 's'} due · about ${Math.max(3, Math.round(due / 4))} min`

    // ---- Send to every registered device ----
    const { data: subscriptions, error: subsError } = await service
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')

    if (subsError) {
      return jsonResponse({ error: 'Could not load subscriptions: ' + subsError.message }, 500)
    }

    if (!subscriptions?.length) {
      return jsonResponse({ sent: 0, reason: 'No devices are subscribed.' })
    }

    webpush.setVapidDetails(
      allowedEmail ? `mailto:${allowedEmail}` : 'mailto:owner@example.com',
      config.vapid_public,
      config.vapid_private
    )

    const payload = JSON.stringify({ title, body, url: '/', tag: isTest ? 'test-push' : 'daily-due' })
    let sent = 0
    const staleEndpoints: string[] = []

    await Promise.all(subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error('Push send error:', statusCode, (err as Error).message)
        }
      }
    }))

    if (staleEndpoints.length) {
      await service.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return jsonResponse({ sent, removedStale: staleEndpoints.length, dueCount: due, mode: isCron ? 'cron' : 'test' })
  } catch (err) {
    console.error('send-due-push fatal:', err)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
