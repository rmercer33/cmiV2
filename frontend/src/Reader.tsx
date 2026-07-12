// Reader.tsx - cmiLibrary Immersive Reading Pane
import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { buildReadLink } from './App';
import type { SourceInfo, LibraryIndex } from './types';

interface ReaderProps {
  resolvedContext: {
    sectionId: string | undefined;
    sourceId: string | undefined;
    collectionId: string | undefined;
    bookId: string | undefined;
    groupId: string | undefined;
    unitId: string | undefined;
    activeBook: any;
    activeGroup: any;
    activeUnit: any;
    s3PathSuffix: string;
  };
  activeSourceConfig: SourceInfo | null;
  libraryIndex: LibraryIndex | null;
  isSidebarCollapsed?: boolean;
  showIds?: boolean;
}

export const Reader: React.FC<ReaderProps> = ({
  resolvedContext,
  activeSourceConfig,
  libraryIndex,
  isSidebarCollapsed = false,
  showIds = false,
}) => {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const lastActiveParagraphRef = useRef<Element | null>(null);
  const isSeekingRef = useRef<boolean>(false);

  const {
    sectionId: activeSectionId,
    sourceId: activeSourceId,
    collectionId: activeCollectionId,
    bookId: activeBookId,
    groupId: activeGroupId,
    unitId: activeUnitId,
    activeBook,
    activeUnit,
    s3PathSuffix
  } = resolvedContext;

  // Fetch HTML fragment when route changes
  useEffect(() => {
    if (!activeSourceId || !activeBookId || !activeUnitId || !activeUnit) {
      setHtmlContent('');
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch the precompiled HTML fragment from the local/public content folder using unit.url
    const contentUrl = `/content/${activeUnit.url}.html`;

    fetch(contentUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load content file: ${res.status} ${res.statusText}`);
        }
        return res.text();
      })
      .then((html) => {
        try {
          // Pre-process HTML in memory using DOMParser to wrap sentences in spans natively
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) {
              const text = node.nodeValue;
              
              // Split by sentence ending punctuation (. ? !) followed by space, or at the end of the string
              const sentences = text.split(/([.!?]+(?:\s+|$))/);
              const fragment = doc.createDocumentFragment();
              
              for (let i = 0; i < sentences.length; i += 2) {
                const sentenceText = sentences[i];
                const delimiter = sentences[i+1] || '';
                
                if (sentenceText.trim()) {
                  const span = doc.createElement('span');
                  span.className = 'cmi-sentence';
                  span.textContent = sentenceText + delimiter;
                  fragment.appendChild(span);
                } else if (delimiter) {
                  fragment.appendChild(doc.createTextNode(delimiter));
                }
              }
              node.parentNode?.replaceChild(fragment, node);
            } else {
              Array.from(node.childNodes).forEach(walk);
            }
          };

          walk(doc.body);

          // If this unit has an audio track, prepend a play indicator to all paragraphs and headings
          if (activeUnit.audiofn) {
            const paragraphs = doc.querySelectorAll('p, h2, h3');
            paragraphs.forEach((p) => {
              const indicator = doc.createElement('span');
              indicator.className = 'audio-seek-indicator';
              indicator.textContent = '▶';
              indicator.setAttribute('title', 'Play from here');
              p.insertBefore(indicator, p.firstChild);
            });
          }

          setHtmlContent(doc.body.innerHTML);
        } catch (parseErr) {
          console.error('Error pre-processing sentences in HTML:', parseErr);
          setHtmlContent(html); // Fallback to raw html if parser fails
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Reader Fetch Error:', err);
        setError('Failed to load text. Please check if the pipeline has processed this unit.');
        setLoading(false);
      });
  }, [activeSourceId, activeBookId, activeUnitId, activeUnit, activeSourceConfig]);

  // Handle Scroll to Hash and Highlight Target
  useEffect(() => {
    if (loading || !htmlContent || !hash) return;

    const timer = setTimeout(() => {
      const elementId = hash.substring(1);
      const element = document.getElementById(elementId);

      if (element) {
        document.querySelectorAll('.highlight-target').forEach((el) => {
          el.classList.remove('highlight-target');
        });

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-target');
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [loading, htmlContent, hash]);

  // Construct S3 URLs using the dynamically constructed path suffix from App.tsx
  const s3BucketUrl = import.meta.env.VITE_S3_AUDIO_BUCKET_URL || '';
  const audioUrl = s3BucketUrl && activeSourceId && s3PathSuffix
    ? `${s3BucketUrl}/${activeSourceId}/audio/${s3PathSuffix}.mp3`
    : '';
  const vttUrl = s3BucketUrl && activeSourceId && s3PathSuffix
    ? `${s3BucketUrl}/${activeSourceId}/audio/${s3PathSuffix}.vtt`
    : '';

  // Reset scroll tracking and play states when switching units
  useEffect(() => {
    lastActiveParagraphRef.current = null;
    setIsAudioPlaying(false);
  }, [activeUnitId]);

  // Handle WebVTT caption synchronization and highlighting
  useEffect(() => {
    if (!activeUnit || !htmlContent) return;

    const audio = audioRef.current;
    if (!audio) return;

    const handleCueChange = () => {
      if (audio.seeking || isSeekingRef.current) return;

      const track = audio.textTracks[0];
      if (!track) return;
      const activeCue = track.activeCues?.[0] as any;

      if (!activeCue || !activeCue.text) return;

      const rawCueText = activeCue.text.trim();
      if (!rawCueText) return;

      let targetId: string | null = null;
      let cueText = rawCueText;

      const pipeIdx = rawCueText.indexOf('|');
      if (pipeIdx !== -1) {
        targetId = rawCueText.substring(0, pipeIdx);
        cueText = rawCueText.substring(pipeIdx + 1);
      }

      const cleanString = (str: string) => 
        str.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      const cleanCue = cleanString(cueText);
      if (!cleanCue) return;

      const parentParagraph = targetId ? document.getElementById(targetId) : null;

      const sentences = parentParagraph 
        ? parentParagraph.querySelectorAll('.cmi-sentence')
        : document.querySelectorAll('.cmi-sentence');
        
      const matchingSentences: HTMLElement[] = [];

      for (const s of Array.from(sentences)) {
        const sText = s.textContent || '';
        const cleanS = cleanString(sText);
        
        if (cleanS && (cleanS.includes(cleanCue) || cleanCue.includes(cleanS))) {
          matchingSentences.push(s as HTMLElement);
        }
      }

      let bestSentenceMatch: HTMLElement | null = null;
      if (matchingSentences.length > 0) {
        if (matchingSentences.length === 1) {
          bestSentenceMatch = matchingSentences[0];
        } else {
          const lastPara = lastActiveParagraphRef.current || parentParagraph;
          if (lastPara) {
            const sameParaMatch = matchingSentences.find((s) => lastPara.contains(s));
            if (sameParaMatch) {
              bestSentenceMatch = sameParaMatch;
            } else {
              const nextSequentialMatch = matchingSentences.find((s) => {
                const position = lastPara.compareDocumentPosition(s);
                return !!(position & Node.DOCUMENT_POSITION_FOLLOWING);
              });
              bestSentenceMatch = nextSequentialMatch || matchingSentences[0];
            }
          } else {
            bestSentenceMatch = matchingSentences[0];
          }
        }
      }

      let bestParagraphMatch: HTMLElement | null = parentParagraph;

      if (!bestSentenceMatch && !bestParagraphMatch) {
        const paragraphs = document.querySelectorAll('#cmi-transcript p');
        const matchingParagraphs: HTMLElement[] = [];

        for (const p of Array.from(paragraphs)) {
          const pText = p.textContent || '';
          const cleanP = cleanString(pText);
          if (cleanP && (cleanP.includes(cleanCue) || cleanCue.includes(cleanP))) {
            matchingParagraphs.push(p as HTMLElement);
          }
        }

        if (matchingParagraphs.length > 0) {
          const lastPara = lastActiveParagraphRef.current;
          if (lastPara) {
            const nextPara = matchingParagraphs.find((p) => {
              const position = lastPara.compareDocumentPosition(p);
              return !!(position & Node.DOCUMENT_POSITION_FOLLOWING);
            });
            bestParagraphMatch = nextPara || matchingParagraphs[0];
          } else {
            bestParagraphMatch = matchingParagraphs[0];
          }
        }
      }

      const matchFound = bestSentenceMatch || bestParagraphMatch;

      if (matchFound) {
        document.querySelectorAll('#cmi-transcript p.active-audio').forEach((el) => {
          el.classList.remove('active-audio');
        });
        document.querySelectorAll('.cmi-sentence.active-sentence').forEach((el) => {
          el.classList.remove('active-sentence');
        });

        if (bestSentenceMatch) {
          (bestSentenceMatch as HTMLElement).classList.add('active-sentence');
          const finalParentParagraph = parentParagraph || (bestSentenceMatch as HTMLElement).closest('#cmi-transcript p') as HTMLElement | null;
          if (finalParentParagraph) {
            finalParentParagraph.classList.add('active-audio');

            if (finalParentParagraph !== lastActiveParagraphRef.current) {
              lastActiveParagraphRef.current = finalParentParagraph;
              finalParentParagraph.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }
          }
        } else if (bestParagraphMatch) {
          (bestParagraphMatch as HTMLElement).classList.add('active-audio');
          if (bestParagraphMatch !== lastActiveParagraphRef.current) {
            lastActiveParagraphRef.current = bestParagraphMatch;
            (bestParagraphMatch as HTMLElement).scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }
      }
    };

    let textTrack: TextTrack | null = null;

    const setupTrackListener = () => {
      if (audio.textTracks && audio.textTracks.length > 0) {
        textTrack = audio.textTracks[0];
        textTrack.mode = 'showing';
        textTrack.addEventListener('cuechange', handleCueChange);
      }
    };

    const handleSeeked = () => {
      isSeekingRef.current = false;
      handleCueChange();
    };

    const handlePlay = () => setIsAudioPlaying(true);
    const handlePause = () => setIsAudioPlaying(false);
    const handleEnded = () => setIsAudioPlaying(false);

    setupTrackListener();
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    
    const trackEl = trackRef.current;
    if (trackEl) {
      trackEl.addEventListener('load', setupTrackListener);
    }

    return () => {
      if (textTrack) {
        textTrack.removeEventListener('cuechange', handleCueChange);
      }
      if (trackEl) {
        trackEl.removeEventListener('load', setupTrackListener);
      }
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      document.querySelectorAll('#cmi-transcript p.active-audio').forEach((el) => {
        el.classList.remove('active-audio');
      });
      document.querySelectorAll('.cmi-sentence.active-sentence').forEach((el) => {
        el.classList.remove('active-sentence');
      });
    };
  }, [activeUnit, htmlContent]);

  // Handle click on paragraphs to seek audio playback
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const cmiElement = target.closest('#cmi-transcript p, #cmi-transcript h2, #cmi-transcript h3') as HTMLElement | null;
    
    if (cmiElement && activeUnit?.audiofn && audioRef.current && !audioRef.current.paused && audioRef.current.textTracks[0]) {
      const track = audioRef.current.textTracks[0];
      if (track && track.cues && track.cues.length > 0) {
        const targetId = cmiElement.id;

        if (targetId) {
          let foundCue: VTTCue | null = null;

          for (let i = 0; i < track.cues.length; i++) {
            const cue = track.cues[i] as VTTCue;
            if (cue.text && (cue.text.startsWith(targetId + '|') || cue.text === targetId)) {
              foundCue = cue;
              break;
            }
          }

          if (foundCue) {
            lastActiveParagraphRef.current = cmiElement;
            audioRef.current.currentTime = foundCue.startTime;
            audioRef.current.play().catch((err) => {
              console.error("Playback failed:", err);
            });
          }
        }
      }
    }
  };

  if (loading) {
    return (
      <main className="reader-container">
        <div className="loader-container">
          <div className="spinner"></div>
          <p>Gathering wisdom...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="reader-container">
        <div className="welcome-screen">
          <div className="welcome-logo">⚠️</div>
          <h2>Content Not Available</h2>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  // Source-level Landing Page displaying its available books/collections
  if (activeSourceId && activeSourceConfig && !activeBookId) {
    // If sections are used, link back to Library Home, else default
    const backButtonText = "← Back to Library Home";
    
    return (
      <main className="reader-container">
        <div className="welcome-screen" style={{ textAlign: 'left', alignItems: 'flex-start', maxWidth: 'var(--max-content-width)', width: '100%' }}>
          
          <button 
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.9rem',
              color: 'var(--accent-color)',
              fontWeight: 500,
              marginBottom: '2rem',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0
            }}
          >
            {backButtonText}
          </button>

          <div className="source-intro-header" style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '2rem',
            width: '100%',
            marginBottom: '3rem',
            alignItems: 'flex-start',
            flexWrap: 'wrap'
          }}>
            <div className="source-cover-wrapper" style={{ flexShrink: 0 }}>
              {activeSourceConfig.image ? (
                <img 
                  src={activeSourceConfig.image} 
                  alt={activeSourceConfig.title} 
                  style={{
                    width: '140px',
                    height: '210px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    boxShadow: '0 4px 10px var(--shadow-color)',
                    border: '1px solid var(--border-color)'
                  }} 
                />
              ) : (
                <div style={{
                  width: '140px',
                  height: '210px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #0F4C5C, var(--bg-tertiary))',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '1.25rem',
                  boxShadow: '0 4px 10px var(--shadow-color)',
                  color: '#FFF',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
                    SOURCE TEACHING
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-sans)', lineHeight: '1.2' }}>
                    {activeSourceConfig.title}
                  </div>
                  <div style={{ height: '3px', width: '20px', backgroundColor: '#FFF', opacity: 0.6 }}></div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flexGrow: 1, minWidth: '240px' }}>
              <h1 style={{ fontSize: '2rem', color: 'var(--text-header)', margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700, borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%' }}>
                {activeSourceConfig.title}
              </h1>
              {activeSourceConfig.description && (
                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0, fontStyle: 'italic' }}>
                  {activeSourceConfig.description}
                </p>
              )}
            </div>
          </div>
          
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)' }}>
            {activeSourceConfig.collections ? "Available Collections" : "Available Books"}
          </h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.5rem',
            width: '100%',
            marginBottom: '3rem'
          }}>
            {activeSourceConfig.collections ? (
              // If collections are present, render them as landing cards
              activeSourceConfig.collections.map((collId) => {
                const collection = activeSourceConfig.collectionInfo?.[collId];
                if (!collection) return null;
                return (
                  <div 
                    key={collId}
                    className="book-landing-card"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 6px var(--shadow-color)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flexGrow: 1 }}>
                      <div>
                        <h3 
                          onClick={() => navigate(buildReadLink({ section: activeSectionId, source: activeSourceId, collection: collId }))}
                          style={{ fontSize: '1.25rem', color: 'var(--text-header)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {collection.title}
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                          {collection.description || `Explore books and teachings inside the ${collection.title} collection.`}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(buildReadLink({ section: activeSectionId, source: activeSourceId, collection: collId }))}
                        style={{
                          alignSelf: 'center',
                          backgroundColor: 'var(--accent-color)',
                          color: '#FFF',
                          padding: '0.5rem 1.25rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginTop: 'auto',
                          border: 'none'
                        }}
                      >
                        Explore Collection
                      </button>
                    </div>
                  </div>
                );
              })
            ) : activeSourceConfig.books ? (
              // Default books cards
              activeSourceConfig.books.map((bookId) => {
                const book = activeSourceConfig.bookInfo?.[bookId];
                if (!book) return null;
                const bookLink = buildReadLink({ section: activeSectionId, source: activeSourceId, book: bookId });
                return (
                  <div 
                    key={bookId}
                    className="book-landing-card"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 6px var(--shadow-color)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                    }}
                  >
                    <div 
                      onClick={() => navigate(bookLink)}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'center',
                        marginBottom: '1.25rem'
                      }}
                    >
                      {book.image ? (
                        <img 
                          src={book.image} 
                          alt={book.title} 
                          style={{
                            width: '130px',
                            height: '195px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            boxShadow: '0 4px 8px var(--shadow-color)',
                            border: '1px solid var(--border-color)'
                          }} 
                        />
                      ) : (
                        <div style={{
                          width: '130px',
                          height: '195px',
                          borderRadius: '6px',
                          background: 'linear-gradient(135deg, var(--accent-color), var(--bg-tertiary))',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          padding: '1rem',
                          color: '#FFF',
                          boxShadow: '0 4px 8px var(--shadow-color)',
                          border: '1px solid var(--border-color)'
                        }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
                            {activeSourceConfig.title.split(' ')[0]}
                          </div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-sans)', lineHeight: '1.2' }}>
                            {book.title}
                          </div>
                          <div style={{ height: '3px', width: '16px', backgroundColor: '#FFF', opacity: 0.6 }}></div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', flexGrow: 1 }}>
                      <div style={{ textAlign: 'center' }}>
                        <h3 
                          onClick={() => navigate(bookLink)}
                          style={{ fontSize: '1.25rem', color: 'var(--text-header)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {book.title}
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                          {book.description || 'Explore the complete chapters, lessons, and spiritual collections inside.'}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(bookLink)}
                        style={{
                          alignSelf: 'center',
                          backgroundColor: 'var(--accent-color)',
                          color: '#FFF',
                          padding: '0.5rem 1.25rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: 'none'
                        }}
                      >
                        Explore Book
                      </button>
                    </div>
                  </div>
                );
              })
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  // Book-level Landing Page displaying its available chapters (groups) or flat lessons (units)
  if (activeSourceId && activeSourceConfig && activeBookId && !activeGroupId && !activeUnitId) {
    const book = activeBook;
    if (book) {
      const backLink = activeCollectionId
        ? buildReadLink({ section: activeSectionId, source: activeSourceId, collection: activeCollectionId })
        : buildReadLink({ section: activeSectionId, source: activeSourceId });

      return (
        <main className="reader-container">
          <div className="welcome-screen" style={{ textAlign: 'left', alignItems: 'flex-start', maxWidth: 'var(--max-content-width)', width: '100%' }}>
            
            <button 
              onClick={() => navigate(backLink)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.9rem',
                color: 'var(--accent-color)',
                fontWeight: 500,
                marginBottom: '2rem',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: 0
              }}
            >
              ← Back to {activeCollectionId ? "Collection Dashboard" : activeSourceConfig.title}
            </button>

            <div className="book-intro-header" style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '2rem',
              width: '100%',
              marginBottom: '3rem',
              alignItems: 'flex-start',
              flexWrap: 'wrap'
            }}>
              <div className="book-cover-wrapper" style={{ flexShrink: 0 }}>
                {book.image ? (
                  <img 
                    src={book.image} 
                    alt={book.title} 
                    style={{
                      width: '140px',
                      height: '210px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      boxShadow: '0 4px 10px var(--shadow-color)',
                      border: '1px solid var(--border-color)'
                    }} 
                  />
                ) : (
                  <div style={{
                    width: '140px',
                    height: '210px',
                    borderRadius: '6px',
                    background: 'linear-gradient(135deg, var(--accent-color), var(--bg-tertiary))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1.25rem',
                    boxShadow: '0 4px 10px var(--shadow-color)',
                    color: '#FFF',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
                      {activeSourceConfig.title.split(' ')[0]}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--font-sans)', lineHeight: '1.2' }}>
                      {book.title}
                    </div>
                    <div style={{ height: '3px', width: '20px', backgroundColor: '#FFF', opacity: 0.6 }}></div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flexGrow: 1, minWidth: '240px' }}>
                <h1 style={{ fontSize: '2rem', color: 'var(--text-header)', margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700 }}>
                  {book.title}
                </h1>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                  {book.description || `Explore the complete teachings, units, and chapters inside the ${book.title} volume.`}
                </p>
              </div>
            </div>

            {book.groups ? (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%' }}>Table of Contents</h2>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '3rem' }}>
                  {book.groups.map((gId: string) => {
                    const group = book.groupInfo?.[gId];
                    if (!group) return null;
                    return (
                      <div key={gId} style={{ marginBottom: '2.5rem' }}>
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                          <h3 style={{ fontSize: '1.25rem', color: 'var(--text-header)', fontFamily: 'var(--font-sans)', fontWeight: 700 }}>
                            {group.title}
                          </h3>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '1.5rem' }}>
                          {group.units.map((uId: string) => {
                            const unit = group.unitInfo?.[uId];
                            if (!unit) return null;
                            const unitLink = buildReadLink({ section: activeSectionId, source: activeSourceId, collection: activeCollectionId, book: activeBookId, group: gId, unit: uId });
                            return (
                              <div 
                                key={uId} 
                                onClick={() => navigate(unitLink)}
                                style={{
                                  padding: '0.6rem 0',
                                  borderBottom: '1px dashed var(--border-color)',
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                  fontSize: '0.975rem',
                                  transition: 'color 0.2s ease, padding-left 0.2s ease',
                                  display: 'flex',
                                  alignItems: 'baseline'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.color = 'var(--accent-color)';
                                  e.currentTarget.style.paddingLeft = '4px';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.color = 'var(--text-secondary)';
                                  e.currentTarget.style.paddingLeft = '0px';
                                }}
                              >
                                <span style={{ marginRight: '0.5rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>•</span>
                                <span dangerouslySetInnerHTML={{ __html: unit.title }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : book.units ? (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%' }}>Table of Contents</h2>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '3rem' }}>
                  {book.units.map((uId: string) => {
                    const unit = book.unitInfo?.[uId];
                    if (!unit) return null;
                    const unitLink = buildReadLink({ section: activeSectionId, source: activeSourceId, collection: activeCollectionId, book: activeBookId, group: 'index', unit: uId });
                    return (
                      <div key={uId} style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem 0' }}>
                        <div 
                          onClick={() => navigate(unitLink)}
                          style={{
                            cursor: 'pointer',
                            color: 'var(--text-header)',
                            fontSize: '1.05rem',
                            lineHeight: '1.4',
                            display: 'block',
                            transition: 'color 0.2s ease'
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent-color)')}
                          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-header)')}
                          dangerouslySetInnerHTML={{ __html: unit.title }}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        </main>
      );
    }
  }

  // Site-level Main Welcome Dashboard
  if (!activeSourceId) {
    return (
      <main className="reader-container">
        <div className="welcome-screen" style={{ textAlign: 'center', alignItems: 'center', maxWidth: 'var(--max-content-width)', width: '100%', padding: '2rem 1rem' }}>
          
          <img 
            src="/cmi-logo.svg" 
            alt="cmiLibrary Logo" 
            style={{
              height: '80px',
              width: 'auto',
              marginBottom: '1.5rem',
              display: 'block'
            }} 
          />

          <h1 style={{ fontSize: '2.5rem', color: 'var(--text-header)', marginBottom: '1rem', fontFamily: 'var(--font-sans)', fontWeight: 800 }}>
            Library of Christ Mind Teachings
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', lineHeight: '1.6', maxWidth: '50ch', marginBottom: '3.5rem', textAlign: 'center' }}>
            An immersive reading and study environment for the Christ Mind Teachings. Choose a teaching source below to begin your study.
          </p>

          {libraryIndex && libraryIndex.sections ? (
            // If sections are present, group available sources by sections elegantly on the dashboard!
            libraryIndex.sections.map((sectId) => {
              const section = libraryIndex.sectionInfo?.[sectId];
              if (!section) return null;
              return (
                <div key={sectId} style={{ width: '100%', textAlign: 'left', marginBottom: '4rem' }}>
                  <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%' }}>
                    {section.title}
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '2rem',
                    width: '100%'
                  }}>
                    {section.sources.map((sourceId) => {
                      const source = section.sourceInfo?.[sourceId];
                      if (!source) return null;
                      return (
                        <div 
                          key={sourceId}
                          className="source-landing-card"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: '0 4px 6px var(--shadow-color)',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                          }}
                        >
                          <div 
                            onClick={() => navigate(buildReadLink({ section: sectId, source: sourceId }))}
                            style={{
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'center',
                              marginBottom: '1.25rem'
                            }}
                          >
                            {source.image ? (
                              <img 
                                src={source.image} 
                                alt={source.title} 
                                style={{
                                  width: '130px',
                                  height: '195px',
                                  objectFit: 'cover',
                                  borderRadius: '6px',
                                  boxShadow: '0 4px 8px var(--shadow-color)',
                                  border: '1px solid var(--border-color)'
                                }} 
                              />
                            ) : (
                              <div style={{
                                width: '130px',
                                height: '195px',
                                borderRadius: '6px',
                                background: 'linear-gradient(135deg, #0F4C5C, var(--bg-tertiary))',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '1rem',
                                color: '#FFF',
                                boxShadow: '0 4px 8px var(--shadow-color)',
                                border: '1px solid var(--border-color)'
                              }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
                                  Source Teaching
                                </div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-sans)', lineHeight: '1.2' }}>
                                  {source.title}
                                </div>
                                <div style={{ height: '3px', width: '16px', backgroundColor: '#FFF', opacity: 0.6 }}></div>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', flexGrow: 1 }}>
                            <div style={{ textAlign: 'center' }}>
                              <h3 
                                onClick={() => navigate(buildReadLink({ section: sectId, source: sourceId }))}
                                style={{ fontSize: '1.25rem', color: 'var(--text-header)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: 700, cursor: 'pointer' }}
                              >
                                {source.title}
                              </h3>
                              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                                {source.description || 'Explore the complete collections and teachings within this spiritual source.'}
                              </p>
                            </div>
                            <button
                              onClick={() => navigate(buildReadLink({ section: sectId, source: sourceId }))}
                              style={{
                                alignSelf: 'center',
                                backgroundColor: 'var(--accent-color)',
                                color: '#FFF',
                                padding: '0.5rem 1.25rem',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: 'none'
                              }}
                            >
                              Explore Teachings
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : libraryIndex && libraryIndex.sources ? (
            // Default flat sources rendering
            <>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '2rem', fontFamily: 'var(--font-sans)', alignSelf: 'flex-start', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%', textAlign: 'left' }}>
                Available Sources
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '2rem',
                width: '100%',
                marginBottom: '3rem',
                textAlign: 'left'
              }}>
                {libraryIndex.sources.map((sourceId) => {
                  const source = libraryIndex.sourceInfo?.[sourceId];
                  if (!source) return null;
                  const sourceLink = buildReadLink({ source: sourceId });
                  return (
                    <div 
                      key={sourceId}
                      className="source-landing-card"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 6px var(--shadow-color)',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                      }}
                    >
                      <div 
                        onClick={() => navigate(sourceLink)}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'center',
                          marginBottom: '1.25rem'
                        }}
                      >
                        {source.image ? (
                          <img 
                            src={source.image} 
                            alt={source.title} 
                            style={{
                              width: '130px',
                              height: '195px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                              boxShadow: '0 4px 8px var(--shadow-color)',
                              border: '1px solid var(--border-color)'
                            }} 
                          />
                        ) : (
                          <div style={{
                            width: '130px',
                            height: '195px',
                            borderRadius: '6px',
                            background: 'linear-gradient(135deg, #0F4C5C, var(--bg-tertiary))',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '1rem',
                            color: '#FFF',
                            boxShadow: '0 4px 8px var(--shadow-color)',
                            border: '1px solid var(--border-color)'
                          }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>
                              Source Teaching
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-sans)', lineHeight: '1.2' }}>
                              {source.title}
                            </div>
                            <div style={{ height: '3px', width: '16px', backgroundColor: '#FFF', opacity: 0.6 }}></div>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', flexGrow: 1 }}>
                        <div style={{ textAlign: 'center' }}>
                          <h3 
                            onClick={() => navigate(sourceLink)}
                            style={{ fontSize: '1.25rem', color: 'var(--text-header)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {source.title}
                          </h3>
                          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                            {source.description || 'Explore the complete collections and teachings within this spiritual source.'}
                          </p>
                        </div>
                        <button
                          onClick={() => navigate(sourceLink)}
                          style={{
                            alignSelf: 'center',
                            backgroundColor: 'var(--accent-color)',
                            color: '#FFF',
                            padding: '0.5rem 1.25rem',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: 'none'
                          }}
                        >
                          Explore Teachings
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="loader-container">
              <div className="spinner"></div>
              <p>Loading spiritual catalog...</p>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (!htmlContent) {
    return (
      <main className="reader-container">
        <div className="welcome-screen">
          <BookOpen className="welcome-logo" size={64} />
          <h1>Welcome to cmiLibrary</h1>
          <p>
            An immersive reading and study environment for the Christ Mind Teachings. 
            Expand a source in the sidebar and choose a unit to begin reading.
          </p>
        </div>
      </main>
    );
  }

  // Compute adjacent sections for sequential navigation (ToC / Lessons navigation)
  let prevLink = null;
  let nextLink = null;
  let bookLink = null;
  let prevTitle = '';
  let nextTitle = '';

  if (activeSourceId && activeBookId && activeUnitId && activeSourceConfig && htmlContent) {
    bookLink = buildReadLink({ section: activeSectionId, source: activeSourceId, collection: activeCollectionId, book: activeBookId });
    const book = activeBook;
    if (book) {
      const sequentialUnits: { groupId: string; unitId: string; title: string }[] = [];
      
      if (book.groups) {
        book.groups.forEach((gId: string) => {
          const group = book.groupInfo?.[gId];
          if (group && group.units) {
            group.units.forEach((uId: string) => {
              const uMeta = group.unitInfo?.[uId];
              if (uMeta) {
                sequentialUnits.push({ groupId: gId, unitId: uId, title: uMeta.title });
              }
            });
          }
        });
      } else if (book.units) {
        book.units.forEach((uId: string) => {
          const uMeta = book.unitInfo?.[uId];
          if (uMeta) {
            sequentialUnits.push({ groupId: 'index', unitId: uId, title: uMeta.title });
          }
        });
      }

      const currentIndex = sequentialUnits.findIndex(
        (u) => u.unitId === activeUnitId && (u.groupId === activeGroupId || activeGroupId === 'index' || activeGroupId === 'flat' || !activeGroupId)
      );

      if (currentIndex > 0) {
        const prev = sequentialUnits[currentIndex - 1];
        prevLink = buildReadLink({
          section: activeSectionId,
          source: activeSourceId,
          collection: activeCollectionId,
          book: activeBookId,
          group: prev.groupId,
          unit: prev.unitId
        });
        prevTitle = prev.title;
      }

      if (currentIndex !== -1 && currentIndex < sequentialUnits.length - 1) {
        const next = sequentialUnits[currentIndex + 1];
        nextLink = buildReadLink({
          section: activeSectionId,
          source: activeSourceId,
          collection: activeCollectionId,
          book: activeBookId,
          group: next.groupId,
          unit: next.unitId
        });
        nextTitle = next.title;
      }
    }
  }

  return (
    <main className={`reader-container ${activeUnit?.audiofn ? 'has-audio-player' : ''} ${isAudioPlaying ? 'audio-is-playing' : ''} ${showIds ? 'show-cmi-ids' : ''} ${activeSourceId ? 'source-' + activeSourceId : ''}`} ref={containerRef} onClick={handleContainerClick}>
      <article className="reader-column">
        <div 
          dangerouslySetInnerHTML={{ __html: htmlContent }} 
          style={{ width: '100%' }}
        />

        {bookLink && (
          <nav style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            marginTop: '5rem',
            paddingTop: '2rem',
            borderTop: '1px solid var(--border-color)',
            width: '100%',
            gap: '1.25rem'
          }}>
            {prevLink ? (
              <button
                onClick={() => navigate(prevLink!)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  textAlign: 'left',
                  minWidth: 0,
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: 0
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent-color)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <ChevronLeft size={18} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, width: '100%' }}>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', opacity: 0.7, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Previous</span>
                  <span 
                    style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', width: '100%' }}
                    dangerouslySetInnerHTML={{ __html: prevTitle }}
                  />
                </div>
              </button>
            ) : (
              <div style={{ width: '100%' }} />
            )}

            <button
              onClick={() => navigate(bookLink!)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'var(--accent-color)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.82rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'none',
                border: 'none',
                padding: '0 0.5rem',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              <span>Table of Contents</span>
            </button>

            {nextLink ? (
              <button
                onClick={() => navigate(nextLink!)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  textAlign: 'right',
                  minWidth: 0,
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: 0
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent-color)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', overflow: 'hidden', minWidth: 0, width: '100%' }}>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', opacity: 0.7, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Next</span>
                  <span 
                    style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', maxWidth: '100%' }}
                    dangerouslySetInnerHTML={{ __html: nextTitle }}
                  />
                </div>
                <ChevronRight size={18} style={{ flexShrink: 0 }} />
              </button>
            ) : (
              <div style={{ width: '100%' }} />
            )}
          </nav>
        )}
      </article>

      {activeUnit?.audiofn && (
        <div className={`sticky-audio-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            autoPlay={false}
            crossOrigin="anonymous"
            preload="auto"
            style={{ width: '100%', maxWidth: '600px' }}
          >
            <track 
              ref={trackRef}
              default 
              kind="metadata" 
              src={vttUrl} 
            />
          </audio>
        </div>
      )}
    </main>
  );
};
