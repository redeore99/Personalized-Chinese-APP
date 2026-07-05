import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WATCH_CHANNELS, WATCH_PICKS, WATCH_TOPICS, WATCH_VIDEOS, getTodaysPick } from '../data/videos'
import { markWatchedToday } from '../lib/habits'

function topicMatches(topics, activeTopic) {
  return activeTopic === 'all' || (topics || []).includes(activeTopic)
}

export default function WatchPage() {
  const navigate = useNavigate()
  const [activeTopic, setActiveTopic] = useState('all')
  const todaysPick = useMemo(() => getTodaysPick(), [])

  const availableTopics = useMemo(() => {
    const present = new Set()
    for (const item of [...WATCH_VIDEOS, ...WATCH_PICKS, ...WATCH_CHANNELS]) {
      for (const topic of item.topics || []) present.add(topic)
    }
    return WATCH_TOPICS.filter(topic => present.has(topic))
  }, [])

  const videos = WATCH_VIDEOS.filter(video => topicMatches(video.topics, activeTopic))
  const picks = WATCH_PICKS.filter(pick => topicMatches(pick.topics, activeTopic))
  const channels = WATCH_CHANNELS.filter(channel => topicMatches(channel.topics, activeTopic))

  const handleOpen = () => {
    // Marks the "watch" step of today's session as done (fire and forget)
    markWatchedToday()
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Watch</h2>
          <p className="text-secondary" style={{ fontSize: 14 }}>
            Curated Chinese video content — songs, stories, characters, and more.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Home</button>
      </div>

      {todaysPick && (
        <div className="card watch-pick-card" style={{ marginBottom: 16 }}>
          <div className="watch-pick-label">Today&apos;s pick</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{todaysPick.title}</h3>
          <div className="text-secondary" style={{ fontSize: 13, marginBottom: 10 }}>
            {todaysPick.channel}{todaysPick.note ? ` · ${todaysPick.note}` : ''}
          </div>
          <a
            className="btn btn-primary btn-sm"
            href={todaysPick.url}
            target="_blank"
            rel="noreferrer"
            onClick={handleOpen}
          >
            Watch on YouTube ↗
          </a>
        </div>
      )}

      <div className="chip-row" style={{ marginBottom: 16 }}>
        <button
          className={`chip ${activeTopic === 'all' ? 'chip-active' : ''}`}
          onClick={() => setActiveTopic('all')}
        >
          all
        </button>
        {availableTopics.map(topic => (
          <button
            key={topic}
            className={`chip ${activeTopic === topic ? 'chip-active' : ''}`}
            onClick={() => setActiveTopic(topic)}
          >
            {topic}
          </button>
        ))}
      </div>

      {videos.length > 0 && (
        <section className="card dashboard-section" style={{ marginBottom: 16 }}>
          <h3 className="section-heading" style={{ marginBottom: 12 }}>Fresh videos</h3>
          <div className="watch-list">
            {videos.map(video => (
              <a
                key={video.id}
                className="watch-row"
                href={video.url || `https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noreferrer"
                onClick={handleOpen}
              >
                <img
                  className="watch-thumb"
                  src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                  alt=""
                  loading="lazy"
                />
                <div>
                  <div className="watch-row-title">{video.title}</div>
                  <div className="watch-row-meta">
                    {video.channel}{video.minutes ? ` · ${video.minutes} min` : ''}
                  </div>
                  <div className="watch-row-topics">{(video.topics || []).join(' · ')}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="card dashboard-section" style={{ marginBottom: 16 }}>
        <h3 className="section-heading" style={{ marginBottom: 4 }}>Shortcuts</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
          Jump straight to the right kind of video on each channel.
        </p>
        <div className="watch-list">
          {picks.map(pick => (
            <a
              key={pick.id}
              className="watch-row watch-row-plain"
              href={pick.url}
              target="_blank"
              rel="noreferrer"
              onClick={handleOpen}
            >
              <div>
                <div className="watch-row-title">{pick.title}</div>
                <div className="watch-row-meta">{pick.channel} · {pick.note}</div>
                <div className="watch-row-topics">{(pick.topics || []).join(' · ')}</div>
              </div>
              <span className="watch-open">↗</span>
            </a>
          ))}
        </div>
      </section>

      <section className="card dashboard-section">
        <h3 className="section-heading" style={{ marginBottom: 12 }}>Channels</h3>
        <div className="watch-list">
          {channels.map(channel => (
            <a
              key={channel.id}
              className="watch-row watch-row-plain"
              href={channel.url}
              target="_blank"
              rel="noreferrer"
              onClick={handleOpen}
            >
              <div>
                <div className="watch-row-title">{channel.name}</div>
                <div className="watch-row-meta">{channel.level} · {channel.description}</div>
                <div className="watch-row-topics">{(channel.topics || []).join(' · ')}</div>
              </div>
              <span className="watch-open">↗</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
