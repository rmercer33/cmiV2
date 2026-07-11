// Reader.tsx - cmiLibrary Immersive Reading Pane
import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SourceInfo, LibraryIndex } from './types';

// Helper to determine if two text snippets are a close match, rejecting tiny partial fragments (false positives)
// but highly tolerant to minor transcription differences (contractions, spelling, split cues)
const isCloseMatch = (str1: string, str2: string): boolean => {
  const normalizeWords = (str: string) => {
    let s = str.toLowerCase();
    s = s.replace(/what['’]s/g, 'what is');
    s = s.replace(/it['’]s/g, 'it is');
    s = s.replace(/that['’]s/g, 'that is');
    s = s.replace(/he['’]s/g, 'he is');
    s = s.replace(/she['’]s/g, 'she is');
    s = s.replace(/there['’]s/g, 'there is');
    s = s.replace(/who['’]s/g, 'who is');
    s = s.replace(/i['’]m/g, 'i am');
    s = s.replace(/you['’]re/g, 'you are');
    s = s.replace(/we['’]re/g, 'we are');
    s = s.replace(/they['’]re/g, 'they are');
    s = s.replace(/isn['’]t/g, 'is not');
    s = s.replace(/aren['’]t/g, 'are not');
    s = s.replace(/don['’]t/g, 'do not');
    s = s.replace(/doesn['’]t/g, 'does not');
    s = s.replace(/can['’]t/g, 'cannot');
    s = s.replace(/won['’]t/g, 'will not');
    s = s.replace(/wouldn['’]t/g, 'would not');
    s = s.replace(/shouldn['’]t/g, 'should not');
    s = s.replace(/couldn['’]t/g, 'could not');
    s = s.replace(/didn['’]t/g, 'did not');
    s = s.replace(/haven['’]t/g, 'have not');
    s = s.replace(/hasn['’]t/g, 'has not');
    s = s.replace(/hadn['’]t/g, 'had not');
    s = s.replace(/let['’]s/g, 'let us');
    return s.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  };

  const words1 = normalizeWords(str1);
  const words2 = normalizeWords(str2);
  
  if (words1.length === 0 || words2.length === 0) return false;

  const shorter = words1.length < words2.length ? words1 : words2;
  const longer = words1.length < words2.length ? words2 : words1;
  const longerSet = new Set(longer);

  let commonCount = 0;
  shorter.forEach((w) => {
    if (longerSet.has(w)) {
      commonCount++;
    }
  });

  const overlapRatio = commonCount / shorter.length;
  const lengthRatio = shorter.length / longer.length;

  // For very short sentences (1-2 words), require 100% overlap AND the longer string can't be huge (prevents random false matches)
  if (shorter.length <= 2) {
    return overlapRatio === 1 && lengthRatio >= 0.5;
  }

  // For longer sentences, require 80% overlap and length ratio >= 0.2
  // An 80% word overlap is extremely robust: it allows perfect matching on contiguous split cues (which are 100% subsets)
  // while strictly rejecting false-positive cues that contain words from adjacent paragraphs (like "I come not" vs "I come to...").
  return overlapRatio >= 0.8 && lengthRatio >= 0.2;
};

interface ReaderProps {
  activeSourceId: string | undefined;
  activeBookId: string | undefined;
  activeGroupId: string | undefined;
  activeUnitId: string | undefined;
  activeSourceConfig: SourceInfo | null;
  libraryIndex: LibraryIndex | null;
  isSidebarCollapsed?: boolean;
}

export const Reader: React.FC<ReaderProps> = ({
  activeSourceId,
  activeBookId,
  activeGroupId,
  activeUnitId,
  activeSourceConfig,
  libraryIndex,
  isSidebarCollapsed = false,
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

  // Fetch HTML fragment when route changes
  useEffect(() => {
    if (!activeSourceId || !activeBookId || !activeGroupId || !activeUnitId || !activeSourceConfig) {
      setHtmlContent('');
      return;
    }

    const book = activeSourceConfig.bookInfo[activeBookId];
    let unit = null;

    if (book) {
      if (book.groups && book.groupInfo && activeGroupId && activeGroupId !== 'index' && activeGroupId !== 'flat') {
        const group = book.groupInfo[activeGroupId];
        unit = group?.unitInfo[activeUnitId];
      } else if (book.units && book.unitInfo) {
        unit = book.unitInfo[activeUnitId];
      }
    }

    if (!unit) {
      setError('Selected lesson metadata could not be found.');
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch the precompiled HTML fragment from the local/public content folder
    // Note: The relative link to our content folder is symlinked from _site
    const contentUrl = `/content/${unit.url}.html`;

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
          if (unit.audiofn) {
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
  }, [activeSourceId, activeBookId, activeGroupId, activeUnitId, activeSourceConfig]);

  // Handle Scroll to Hash and Highlight Target
  useEffect(() => {
    if (loading || !htmlContent || !hash) return;

    // Small delay to ensure the DOM has updated and completed rendering
    const timer = setTimeout(() => {
      const elementId = hash.substring(1); // Strip the leading '#'
      const element = document.getElementById(elementId);

      if (element) {
        // Remove previous highlight classes
        document.querySelectorAll('.highlight-target').forEach((el) => {
          el.classList.remove('highlight-target');
        });

        // Scroll to element and highlight
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-target');
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [loading, htmlContent, hash]);

  // Get active unit metadata
  let activeUnit: any = null;
  if (activeSourceConfig && activeBookId && activeUnitId) {
    const book = activeSourceConfig.bookInfo[activeBookId];
    if (book) {
      if (book.groups && book.groupInfo && activeGroupId && activeGroupId !== 'index' && activeGroupId !== 'flat') {
        const group = book.groupInfo[activeGroupId];
        activeUnit = group?.unitInfo[activeUnitId];
      } else if (book.units && book.unitInfo) {
        activeUnit = book.unitInfo[activeUnitId];
      }
    }
  }

  // Construct S3 URLs according to pattern: s3BucketURI/source/audio/book[/group]/unit
  const s3BucketUrl = import.meta.env.VITE_S3_AUDIO_BUCKET_URL || '';
  const audioFileName = activeUnit?.audiofn || activeUnitId;
  const pathSuffix = activeGroupId && activeGroupId !== 'index' && activeGroupId !== 'flat'
    ? `${activeBookId}/${activeGroupId}/${audioFileName}`
    : `${activeBookId}/${audioFileName}`;
  
  const audioUrl = s3BucketUrl && activeSourceId
    ? `${s3BucketUrl}/${activeSourceId}/audio/${pathSuffix}.mp3`
    : '';
  const vttUrl = s3BucketUrl && activeSourceId
    ? `${s3BucketUrl}/${activeSourceId}/audio/${pathSuffix}.vtt`
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
      // Ignore updates if the player is currently seeking to prevent snapping and racing bugs
      if (audio.seeking || isSeekingRef.current) return;

      const track = audio.textTracks[0];
      if (!track) return;
      const activeCue = track.activeCues?.[0] as any;

      // If no active cue, or cue text is empty, keep current highlight active to prevent flashing
      if (!activeCue || !activeCue.text) return;

      const cueText = activeCue.text.trim();
      if (!cueText) return;

      const cleanString = (str: string) => 
        str.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      const cleanCue = cleanString(cueText);
      // Prevent matching on empty/punctuation cues which would trigger jump-to-bottom
      if (!cleanCue) return;

      // Try to find matching sentence span in the transcript
      const sentences = document.querySelectorAll('.cmi-sentence');
      const matchingSentences: HTMLElement[] = [];

      for (const s of Array.from(sentences)) {
        const sText = s.textContent || '';
        const cleanS = cleanString(sText);
        
        // Use loose containment check for natural playback (proximity matching handles distant jumps).
        // This ensures smaller spoken WebVTT cue fragments correctly highlight the larger DOM sentences!
        if (cleanS && (cleanS.includes(cleanCue) || cleanCue.includes(cleanS))) {
          matchingSentences.push(s as HTMLElement);
        }
      }

      let bestSentenceMatch: HTMLElement | null = null;
      if (matchingSentences.length > 0) {
        if (matchingSentences.length === 1) {
          bestSentenceMatch = matchingSentences[0];
        } else {
          // Proximity Matching: If there are multiple matches (common short phrases like "Yes"),
          // find the one closest to our last active paragraph in linear document order.
          const lastPara = lastActiveParagraphRef.current;
          if (lastPara) {
            // 1. Is one of the matched sentences inside the current paragraph?
            const sameParaMatch = matchingSentences.find((s) => lastPara.contains(s));
            if (sameParaMatch) {
              bestSentenceMatch = sameParaMatch;
            } else {
              // 2. Otherwise, find the next matched sentence positioned *after* the current paragraph
              const nextSequentialMatch = matchingSentences.find((s) => {
                const position = lastPara.compareDocumentPosition(s);
                return !!(position & Node.DOCUMENT_POSITION_FOLLOWING);
              });
              // Fallback to the first match if no sequential ones exist
              bestSentenceMatch = nextSequentialMatch || matchingSentences[0];
            }
          } else {
            // First run: Default to the first match in the document
            bestSentenceMatch = matchingSentences[0];
          }
        }
      }

      let bestParagraphMatch: HTMLElement | null = null;

      // Fallback: If no single sentence matched perfectly (due to sentence boundary mismatch),
      // let's fall back to paragraph matching so that at least something highlights!
      if (!bestSentenceMatch) {
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
            // Find next sequential paragraph matching the text
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
        // Clear previous active highlights ONLY when we have a confirmed new match
        document.querySelectorAll('#cmi-transcript p.active-audio').forEach((el) => {
          el.classList.remove('active-audio');
        });
        document.querySelectorAll('.cmi-sentence.active-sentence').forEach((el) => {
          el.classList.remove('active-sentence');
        });

        if (bestSentenceMatch) {
          // Highlight active sentence span
          (bestSentenceMatch as HTMLElement).classList.add('active-sentence');
          
          // Highlight parent paragraph for structural context
          const parentParagraph = (bestSentenceMatch as HTMLElement).closest('#cmi-transcript p') as HTMLElement | null;
          if (parentParagraph) {
            parentParagraph.classList.add('active-audio');

            // SCROLL ONLY WHEN PARAGRAPH CHANGES
            // This prevents "jumping/bobbing" scroll while reading sentences within the same paragraph!
            if (parentParagraph !== lastActiveParagraphRef.current) {
              lastActiveParagraphRef.current = parentParagraph;
              parentParagraph.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }
          }
        } else if (bestParagraphMatch) {
          // Fallback paragraph highlight
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
        textTrack.mode = 'showing'; // Set mode to showing to receive events
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

    // Attempt immediately and also listen to track load events
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
      // Clean up highlights
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
    
    // Find the closest paragraph or heading element
    const cmiElement = target.closest('#cmi-transcript p, #cmi-transcript h2, #cmi-transcript h3') as HTMLElement | null;
    
    // Gated: Only allow click-to-seek if the audio is currently playing to prevent accidental playback triggers!
    if (cmiElement && activeUnit?.audiofn && audioRef.current && !audioRef.current.paused && audioRef.current.textTracks[0]) {
      const track = audioRef.current.textTracks[0];
      if (track && track.cues && track.cues.length > 0) {
        // We extract the true first sentence from the paragraph's plain text content.
        // This is 100% robust against nested HTML tags (like bold/italics) which would otherwise split spans into tiny fragments and fail similarity ratio checks!
        const plainText = cmiElement.textContent || '';
        const rawSentences = plainText.split(/([.!?]+(?:\s+|$))/);
        const firstSentenceText = (rawSentences[0] || '') + (rawSentences[1] || '');
        // Strip out the visual "▶" play indicator from the start
        const targetText = firstSentenceText.replace(/^▶\s*/, '').trim();

        if (targetText) {
          const cleanString = (str: string) => 
            str.toLowerCase()
              .replace(/[^\w\s]/g, '')
              .replace(/\s+/g, ' ')
              .trim();

          const targetClean = cleanString(targetText);

          if (targetClean) {
            const allElements = Array.from(document.querySelectorAll('#cmi-transcript p, #cmi-transcript h2, #cmi-transcript h3'));
            const targetIdx = allElements.indexOf(cmiElement);
            const activeIdx = lastActiveParagraphRef.current ? allElements.indexOf(lastActiveParagraphRef.current) : -1;

            let foundCue: VTTCue | null = null;
            let currentCueIndex = 0;

            // Determine the current cue index based on the audio's physical current time
            if (audioRef.current.currentTime > 0) {
              for (let i = 0; i < track.cues.length; i++) {
                if (track.cues[i].endTime >= audioRef.current.currentTime) {
                  currentCueIndex = i;
                  break;
                }
              }
            }

            // 1. BOUNDED DIRECTIONAL SEARCH (as requested by user)
            // If we know the clicked paragraph is strictly AFTER or BEFORE the active paragraph,
            // we constrain the VTT search strictly from the current audio time forward/backward!
            if (activeIdx !== -1 && targetIdx !== -1 && activeIdx !== targetIdx) {
              if (targetIdx > activeIdx) {
                // Seeking Forward: Calculate relative occurrences BETWEEN the active and clicked paragraphs
                let relativeOccurrenceIndex = 0;
                for (let i = activeIdx + 1; i < targetIdx; i++) {
                  const elPlainText = allElements[i].textContent || '';
                  const elRawSentences = elPlainText.split(/([.!?]+(?:\s+|$))/);
                  const elFirstSentence = ((elRawSentences[0] || '') + (elRawSentences[1] || '')).replace(/^▶\s*/, '').trim();
                  if (isCloseMatch(elFirstSentence, targetText)) {
                    relativeOccurrenceIndex++;
                  }
                }

                let matchCount = 0;
                let lastMatchedCueIndex = -5;
                // Add a small safe buffer (-2 cues) in case current time was slightly lagging the DOM transition
                const safeStartIndex = Math.max(0, currentCueIndex - 2);

                for (let i = safeStartIndex; i < track.cues.length; i++) {
                  const cue = track.cues[i] as VTTCue;
                  if (isCloseMatch(cue.text, targetText)) {
                    // Contiguous cue deduplication: If VTT splits the same paragraph into adjacent cues, count it as ONE occurrence!
                    if (i - lastMatchedCueIndex <= 2) {
                      lastMatchedCueIndex = i;
                      continue;
                    }
                    if (matchCount === relativeOccurrenceIndex) {
                      foundCue = cue;
                      break;
                    }
                    matchCount++;
                    lastMatchedCueIndex = i;
                  }
                }
              } else {
                // Seeking Backward: Calculate relative occurrences BETWEEN the clicked and active paragraphs
                let relativeOccurrenceIndex = 0;
                for (let i = activeIdx - 1; i > targetIdx; i--) {
                  const elPlainText = allElements[i].textContent || '';
                  const elRawSentences = elPlainText.split(/([.!?]+(?:\s+|$))/);
                  const elFirstSentence = ((elRawSentences[0] || '') + (elRawSentences[1] || '')).replace(/^▶\s*/, '').trim();
                  if (isCloseMatch(elFirstSentence, targetText)) {
                    relativeOccurrenceIndex++;
                  }
                }

                let matchCount = 0;
                let lastMatchedCueIndex = track.cues.length + 5;
                // Add a small safe buffer (+2 cues) to current time index
                const safeStartIndex = Math.min(track.cues.length - 1, currentCueIndex + 2);

                for (let i = safeStartIndex; i >= 0; i--) {
                  const cue = track.cues[i] as VTTCue;
                  if (isCloseMatch(cue.text, targetText)) {
                    // Contiguous cue deduplication
                    if (lastMatchedCueIndex - i <= 2) {
                      lastMatchedCueIndex = i;
                      continue;
                    }
                    if (matchCount === relativeOccurrenceIndex) {
                      foundCue = cue;
                      break;
                    }
                    matchCount++;
                    lastMatchedCueIndex = i;
                  }
                }
              }
            }

            // 2. ABSOLUTE FALLBACK SEARCH
            // If bounded search fails, or if we clicked the same paragraph, or no active paragraph exists yet:
            // We search from the absolute beginning, tracking global occurrences.
            if (!foundCue) {
              let absoluteOccurrenceIndex = 0;
              for (let i = 0; i < targetIdx; i++) {
                const elPlainText = allElements[i].textContent || '';
                const elRawSentences = elPlainText.split(/([.!?]+(?:\s+|$))/);
                const elFirstSentence = ((elRawSentences[0] || '') + (elRawSentences[1] || '')).replace(/^▶\s*/, '').trim();
                if (isCloseMatch(elFirstSentence, targetText)) {
                  absoluteOccurrenceIndex++;
                }
              }

              let matchCount = 0;
              let lastMatchedCueIndex = -5;
              for (let i = 0; i < track.cues.length; i++) {
                const cue = track.cues[i] as VTTCue;
                if (isCloseMatch(cue.text, targetText)) {
                  // Contiguous cue deduplication
                  if (i - lastMatchedCueIndex <= 2) {
                    lastMatchedCueIndex = i;
                    continue;
                  }
                  if (matchCount === absoluteOccurrenceIndex) {
                    foundCue = cue;
                    break;
                  }
                  matchCount++;
                  lastMatchedCueIndex = i;
                }
              }
            }

            if (foundCue) {
              // Immediately update the last active paragraph reference to the clicked element.
              // This aligns the proximity matching anchor immediately, preventing any backward highlights!
              lastActiveParagraphRef.current = cmiElement;

              audioRef.current.currentTime = foundCue.startTime;
              audioRef.current.play().catch((err) => {
                console.error("Playback failed:", err);
              });
            }
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

  // Source-level Landing Page displaying its available books
  if (activeSourceId && activeSourceConfig && !activeBookId) {
    return (
      <main className="reader-container">
        <div className="welcome-screen" style={{ textAlign: 'left', alignItems: 'flex-start', maxWidth: 'var(--max-content-width)', width: '100%' }}>
          
          {/* Back to Library Home Dashboard Link */}
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
              cursor: 'pointer'
            }}
          >
            ← Back to Library Home
          </button>

          {/* Source Intro Header Area */}
          <div className="source-intro-header" style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '2rem',
            width: '100%',
            marginBottom: '3rem',
            alignItems: 'flex-start',
            flexWrap: 'wrap'
          }}>
            {/* Source Cover Image or CSS Fallback */}
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
                /* Stylized Cover Placeholder with elegant deep gradient covers styling */
                <div style={{
                  width: '140px',
                  height: '210px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #0F4C5C, var(--bg-tertiary))', /* Teal-oriented elegant look */
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

            {/* Source Details and description text */}
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
          
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)' }}>Available Books</h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.5rem',
            width: '100%',
            marginBottom: '3rem'
          }}>
            {activeSourceConfig.books.map((bookId) => {
              const book = activeSourceConfig.bookInfo[bookId];
              if (!book) return null;
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
                  {/* Centered Clickable Portrait Book Cover Area */}
                  <div 
                    onClick={() => navigate(`/read/${activeSourceId}/${bookId}`)}
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
                          border: '1px solid var(--border-color)',
                          transition: 'transform 0.3s ease'
                        }} 
                        onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                        onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                    ) : (
                      /* Beautiful CSS Fallback Portrait Gradient Cover */
                      <div 
                        style={{
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
                          border: '1px solid var(--border-color)',
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.opacity = '0.95')}
                        onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                      >
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

                  {/* Book Text Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', flexGrow: 1 }}>
                    <div style={{ textAlign: 'center' }}>
                      <h3 
                        onClick={() => navigate(`/read/${activeSourceId}/${bookId}`)}
                        style={{ fontSize: '1.25rem', color: 'var(--text-header)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {book.title}
                      </h3>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                        {book.description || 'Explore the complete chapters, lessons, and spiritual collections inside.'}
                      </p>
                    </div>

                    <button
                      onClick={() => navigate(`/read/${activeSourceId}/${bookId}`)}
                      style={{
                        alignSelf: 'center', /* Centered button to match the book cover layout */
                        backgroundColor: 'var(--accent-color)',
                        color: '#FFF',
                        padding: '0.5rem 1.25rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Explore Book
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // Book-level Landing Page displaying its available chapters (groups) or flat lessons (units)
  if (activeSourceId && activeSourceConfig && activeBookId && !activeGroupId) {
    const book = activeSourceConfig.bookInfo[activeBookId];
    if (book) {
      return (
        <main className="reader-container">
          <div className="welcome-screen" style={{ textAlign: 'left', alignItems: 'flex-start', maxWidth: 'var(--max-content-width)', width: '100%' }}>
            
            {/* Back to Source Dashboard Link */}
            <button 
              onClick={() => navigate(`/read/${activeSourceId}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.9rem',
                color: 'var(--accent-color)',
                fontWeight: 500,
                marginBottom: '2rem',
                cursor: 'pointer'
              }}
            >
              ← Back to {activeSourceConfig.title}
            </button>

            {/* Book Intro Header Area */}
            <div className="book-intro-header" style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '2rem',
              width: '100%',
              marginBottom: '3rem',
              alignItems: 'flex-start',
              flexWrap: 'wrap'
            }}>
              {/* Cover Image or CSS Fallback */}
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
                  /* Stylized Cover Placeholder with warm gradient cover styling */
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

              {/* Book Details and description text */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flexGrow: 1, minWidth: '240px' }}>
                <h1 style={{ fontSize: '2rem', color: 'var(--text-header)', margin: 0, fontFamily: 'var(--font-sans)', fontWeight: 700 }}>
                  {book.title}
                </h1>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                  {book.description || `Explore the complete teachings, units, and chapters inside the ${book.title} volume.`}
                </p>
              </div>
            </div>

            {/* Render chapters or flat lessons dynamically */}
            {book.groups ? (
              /* Grouped Book Layout: Table of Contents for Chapters and their Sections */
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%' }}>Table of Contents</h2>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '3rem' }}>
                  {book.groups.map((groupId) => {
                    const group = book.groupInfo?.[groupId];
                    if (!group) return null;
                    return (
                      <div key={groupId} style={{ marginBottom: '2.5rem' }}>
                        {/* Chapter Title Header */}
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                          <h3 style={{ fontSize: '1.25rem', color: 'var(--text-header)', fontFamily: 'var(--font-sans)', fontWeight: 700 }}>
                            {group.title}
                          </h3>
                        </div>
                        
                        {/* Nested Clickable Sections List */}
                        <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '1.5rem' }}>
                          {group.units.map((unitId) => {
                            const unit = group.unitInfo?.[unitId];
                            if (!unit) return null;
                            return (
                              <div 
                                key={unitId} 
                                onClick={() => navigate(`/read/${activeSourceId}/${activeBookId}/${groupId}/${unitId}`)}
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
              /* Flat Book Layout: Table of Contents for Lessons directly */
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-sans)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%' }}>Table of Contents</h2>
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '3rem' }}>
                  {book.units.map((unitId) => {
                    const unit = book.unitInfo?.[unitId];
                    if (!unit) return null;
                    return (
                      <div key={unitId} style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem 0' }}>
                        <div 
                          onClick={() => navigate(`/read/${activeSourceId}/${activeBookId}/index/${unitId}`)}
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
          
          {/* Large Brand Site Logo */}
          <img 
            src="/cmi-logo.svg" 
            alt="cmiLibrary Logo" 
            style={{
              height: '80px',
              width: 'auto',
              marginBottom: '1.5rem',
              animation: 'fadeIn 0.5s ease',
              display: 'block'
            }} 
          />

          <h1 style={{ fontSize: '2.5rem', color: 'var(--text-header)', marginBottom: '1rem', fontFamily: 'var(--font-sans)', fontWeight: 800 }}>
            Library of Christ Mind Teachings
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', lineHeight: '1.6', maxWidth: '50ch', marginBottom: '3.5rem', textAlign: 'center' }}>
            An immersive reading and study environment for the Christ Mind Teachings. Choose a teaching source below to begin your study.
          </p>

          <h2 style={{ fontSize: '1.75rem', marginBottom: '2rem', fontFamily: 'var(--font-sans)', alignSelf: 'flex-start', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', width: '100%', textAlign: 'left' }}>
            Available Sources
          </h2>

          {libraryIndex ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '2rem',
              width: '100%',
              marginBottom: '3rem',
              textAlign: 'left'
            }}>
              {libraryIndex.sources.map((sourceId) => {
                const source = libraryIndex.sourceInfo[sourceId];
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
                    {/* Centered Clickable Portrait Source Cover Area */}
                    <div 
                      onClick={() => navigate(`/read/${sourceId}`)}
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
                            border: '1px solid var(--border-color)',
                            transition: 'transform 0.3s ease'
                          }} 
                          onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                          onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                        />
                      ) : (
                        /* Beautiful CSS Fallback Portrait Gradient Cover */
                        <div 
                          style={{
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
                            border: '1px solid var(--border-color)',
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.opacity = '0.95')}
                          onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                        >
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

                    {/* Source Text Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', flexGrow: 1 }}>
                      <div style={{ textAlign: 'center' }}>
                        <h3 
                          onClick={() => navigate(`/read/${sourceId}`)}
                          style={{ fontSize: '1.25rem', color: 'var(--text-header)', margin: '0 0 0.5rem 0', fontFamily: 'var(--font-sans)', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {source.title}
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                          {source.description || 'Explore the complete collections and teachings within this spiritual source.'}
                        </p>
                      </div>

                      <button
                        onClick={() => navigate(`/read/${sourceId}`)}
                        style={{
                          alignSelf: 'center', /* Centered button to match the cover layout */
                          backgroundColor: 'var(--accent-color)',
                          color: '#FFF',
                          padding: '0.5rem 1.25rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Explore Teachings
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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

  // Compute adjacent sections for sequential navigation (Table of Contents / Lessons navigation)
  let prevLink = null;
  let nextLink = null;
  let bookLink = null;
  let prevTitle = '';
  let nextTitle = '';

  if (activeSourceId && activeBookId && activeUnitId && activeSourceConfig && htmlContent) {
    bookLink = `/read/${activeSourceId}/${activeBookId}`;
    const book = activeSourceConfig.bookInfo[activeBookId];
    if (book) {
      // Flatten all units into a sequential list
      const sequentialUnits: { groupId: string; unitId: string; title: string }[] = [];
      
      if (book.groups) {
        book.groups.forEach((gId) => {
          const group = book.groupInfo?.[gId];
          if (group && group.units) {
            group.units.forEach((uId) => {
              const uMeta = group.unitInfo?.[uId];
              if (uMeta) {
                sequentialUnits.push({ groupId: gId, unitId: uId, title: uMeta.title });
              }
            });
          }
        });
      } else if (book.units) {
        book.units.forEach((uId) => {
          const uMeta = book.unitInfo?.[uId];
          if (uMeta) {
            sequentialUnits.push({ groupId: 'index', unitId: uId, title: uMeta.title });
          }
        });
      }

      // Find current index
      const currentIndex = sequentialUnits.findIndex(
        (u) => u.unitId === activeUnitId && (u.groupId === activeGroupId || activeGroupId === 'index' || activeGroupId === 'flat')
      );

      if (currentIndex > 0) {
        const prev = sequentialUnits[currentIndex - 1];
        prevLink = `/read/${activeSourceId}/${activeBookId}/${prev.groupId}/${prev.unitId}`;
        prevTitle = prev.title;
      }

      if (currentIndex !== -1 && currentIndex < sequentialUnits.length - 1) {
        const next = sequentialUnits[currentIndex + 1];
        nextLink = `/read/${activeSourceId}/${activeBookId}/${next.groupId}/${next.unitId}`;
        nextTitle = next.title;
      }
    }
  }

  return (
    <main className={`reader-container ${activeUnit?.audiofn ? 'has-audio-player' : ''} ${isAudioPlaying ? 'audio-is-playing' : ''}`} ref={containerRef} onClick={handleContainerClick}>
      <article className="reader-column">
        {/* Inject precompiled, styled HTML fragment securely */}
        <div 
          dangerouslySetInnerHTML={{ __html: htmlContent }} 
          style={{ width: '100%' }}
        />

        {/* Sequential Section Navigation Bar */}
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
            {/* Previous Button */}
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
                  minWidth: 0, /* Crucial for CSS Grid ellipsis truncation */
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
              <div style={{ width: '100%' }} /> /* Spacer */
            )}

            {/* Back to Book Table of Contents */}
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

            {/* Next Button */}
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
                  minWidth: 0, /* Crucial for CSS Grid ellipsis truncation */
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
              <div style={{ width: '100%' }} /> /* Spacer */
            )}
          </nav>
        )}
      </article>

      {/* Sticky Audio Player */}
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
