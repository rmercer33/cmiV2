import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { RoomsConfig, SiteInfo } from './types';

export const LibraryHome: React.FC = () => {
  const navigate = useNavigate();
  const [roomsConfig, setRoomsConfig] = useState<RoomsConfig | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set document title
    document.title = "cmiLibrary | Home";

    // Load site info (logo/theme bases)
    fetch('/info.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SiteInfo | null) => {
        if (data) setSiteInfo(data);
      })
      .catch((err) => console.error("Error loading site info:", err));

    // Load rooms config
    fetch('/config/rooms.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load library rooms configuration.');
        return res.json();
      })
      .then((data: RoomsConfig) => {
        setRoomsConfig(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load library configurations.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="loader-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Opening the Library doors...</p>
      </div>
    );
  }

  if (error || !roomsConfig) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-header)' }}>
        <h2>Library Error</h2>
        <p>{error || 'Unable to load library rooms.'}</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-serif)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem 1rem'
    }}>
      {/* Header Identity */}
      <header style={{
        width: '100%',
        maxWidth: 'var(--max-content-width)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '1.5rem',
        marginBottom: '3rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img 
            src={siteInfo?.logo || "/cmi-logo.svg"} 
            alt="Library Logo" 
            style={{ height: '40px', width: 'auto' }} 
          />
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: '1.25rem',
            color: 'var(--text-header)'
          }}>
            {roomsConfig.title}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}>
          {roomsConfig.helpUrl && (
            <a 
              href={roomsConfig.helpUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 500 }}
              onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Help & Documentation
            </a>
          )}
          {roomsConfig.contactUrl && (
            <a 
              href={roomsConfig.contactUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 500 }}
              onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              Contact Us
            </a>
          )}
        </div>
      </header>

      {/* Main Hero & Welcome */}
      <main style={{
        width: '100%',
        maxWidth: 'var(--max-content-width)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '2.5rem'
      }}>
        <div style={{ maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h1 style={{
            fontSize: '2.5rem',
            color: 'var(--text-header)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 800,
            margin: 0
          }}>
            Welcome to the Library
          </h1>
          <p style={{
            fontSize: '1.2rem',
            color: 'var(--text-secondary)',
            lineHeight: '1.6',
            margin: 0
          }}>
            {roomsConfig.description}
          </p>
        </div>

        {/* Rooms Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2.5rem',
          width: '100%',
          marginTop: '2rem',
          marginBottom: '4rem'
        }}>
          {roomsConfig.rooms.map((room) => (
            <div 
              key={room.id}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.5rem',
                boxShadow: '0 4px 12px var(--shadow-color)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px var(--shadow-color)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px var(--shadow-color)';
              }}
              onClick={() => navigate(`/room/${room.id}`)}
            >
              {/* Cover Image Placeholder */}
              <div style={{ width: '100%', height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {room.image ? (
                  <img 
                    src={room.image} 
                    alt={room.title} 
                    style={{
                      height: '100%',
                      width: '120px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      boxShadow: '0 4px 8px var(--shadow-color)',
                      border: '1px solid var(--border-color)'
                    }} 
                  />
                ) : (
                  <div style={{
                    height: '100%',
                    width: '120px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--accent-color), var(--bg-tertiary))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: '#FFF',
                    boxShadow: '0 4px 8px var(--shadow-color)'
                  }}>
                    <BookOpen size={40} />
                  </div>
                )}
              </div>

              {/* Room Text Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexGrow: 1 }}>
                <h3 style={{
                  fontSize: '1.5rem',
                  color: 'var(--text-header)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  margin: 0
                }}>
                  {room.title}
                </h3>
                <p style={{
                  fontSize: '0.95rem',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5',
                  margin: 0
                }}>
                  {room.description}
                </p>
              </div>

              {/* Action Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/room/${room.id}`);
                }}
                style={{
                  backgroundColor: 'var(--accent-color)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.6rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseOut={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
              >
                Enter Room
              </button>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        width: '100%',
        maxWidth: 'var(--max-content-width)',
        borderTop: '1px solid var(--border-color)',
        paddingTop: '1.5rem',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)'
      }}>
        &copy; {new Date().getFullYear()} Christ Mind Library. All rights reserved.
      </footer>
    </div>
  );
};
