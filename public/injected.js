(() => {
  const BRIDGE_FLAG = '__yt_caption_bridge_installed__';
  if (window[BRIDGE_FLAG]) return;
  window[BRIDGE_FLAG] = true;

  const TRACK_MESSAGE_TYPE = 'YT_CAPTION_TRACK';
  const TRACK_REQUEST_TYPE = 'YT_CAPTION_TRACK_REQUEST';
  const SUBTITLE_FETCH_REQUEST_TYPE = 'YT_SUBTITLE_FETCH_REQUEST';
  const SUBTITLE_FETCH_RESPONSE_TYPE = 'YT_SUBTITLE_FETCH_RESPONSE';
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 500;
  const FETCH_TIMEOUT_MS = 4500;
  /**
   * @typedef {{
   *   requestId: string,
   *   url: string
   * }} BridgeSubtitleFetchRequest
   *
   * @typedef {{
   *   requestId: string,
   *   ok: boolean,
   *   status: number,
   *   contentType: string,
   *   text: string,
   *   error?: string,
   *   source: 'INJECTED_FETCH',
   *   elapsedMs: number,
   *   isHtml: boolean,
   *   reason: ''|'CONSENT_REQUIRED'|'CAPTCHA_DETECTED'|'LOGIN_REQUIRED'|'UNKNOWN_HTML',
   *   htmlSnippet?: string
   * }} BridgeSubtitleFetchResponse
   */

  function getVideoIdFromLocation() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname.startsWith('/watch')) {
        return String(url.searchParams.get('v') || '').trim();
      }
      if (url.pathname.startsWith('/shorts/')) {
        return String(url.pathname.split('/')[2] || '').trim();
      }
      if (url.pathname.startsWith('/embed/')) {
        return String(url.pathname.split('/')[2] || '').trim();
      }
    } catch (_) {}
    return '';
  }

  function parseJsonSafe(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function readPlayerResponse() {
    const direct = parseJsonSafe(window.ytInitialPlayerResponse);
    if (direct) return direct;

    const ytcfgPlayer = parseJsonSafe(
      window?.ytcfg?.get?.('PLAYER_RESPONSE') || window?.ytcfg?.data_?.PLAYER_RESPONSE
    );
    if (ytcfgPlayer) return ytcfgPlayer;

    const moviePlayerResponse = parseJsonSafe(window?.ytplayer?.config?.args?.player_response);
    if (moviePlayerResponse) return moviePlayerResponse;

    return null;
  }

  function extractCaptionTracks(playerResponse) {
    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
  }

  function normalizeTrack(track) {
    if (!track || typeof track !== 'object') return null;
    const baseUrl = String(track.baseUrl || '').trim();
    if (!baseUrl) return null;
    return {
      baseUrl,
      languageCode: String(track.languageCode || '').trim(),
      isAsr: String(track.kind || '').toLowerCase() === 'asr'
    };
  }

  function pickPreferredTrack(tracks) {
    const normalized = tracks.map((track) => normalizeTrack(track)).filter(Boolean);
    if (!normalized.length) return null;

    const english = normalized.filter((track) =>
      String(track.languageCode || '').toLowerCase().startsWith('en')
    );
    const englishManual = english.find((track) => track.isAsr !== true);
    if (englishManual) return englishManual;
    if (english.length) return english[0];

    const manual = normalized.find((track) => track.isAsr !== true);
    return manual || normalized[0] || null;
  }

  function emitTrack(payload) {
    window.postMessage(
      {
        type: TRACK_MESSAGE_TYPE,
        payload
      },
      '*'
    );
  }

  function buildPayload(track, videoId, status) {
    const normalizedVideoId = String(videoId || '').trim();
    if (track?.baseUrl) {
      return {
        videoId: normalizedVideoId,
        baseUrl: track.baseUrl,
        languageCode: String(track.languageCode || ''),
        isAsr: Boolean(track.isAsr),
        status: 'OK'
      };
    }
    return {
      videoId: normalizedVideoId,
      baseUrl: '',
      languageCode: '',
      isAsr: false,
      status: status || 'NO_SUBTITLES'
    };
  }

  function resolveTrack(requestedVideoId, attempt) {
    const locationVideoId = getVideoIdFromLocation();
    const videoId = String(requestedVideoId || locationVideoId).trim();
    const playerResponse = readPlayerResponse();
    const tracks = extractCaptionTracks(playerResponse);
    const preferred = pickPreferredTrack(tracks);
    if (preferred) {
      emitTrack(buildPayload(preferred, videoId, 'OK'));
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      window.setTimeout(() => {
        resolveTrack(videoId, attempt + 1);
      }, RETRY_DELAY_MS);
      return;
    }

    emitTrack(buildPayload(null, videoId, 'NO_SUBTITLES'));
  }

  function handleWindowMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === TRACK_REQUEST_TYPE) {
      const requestedVideoId = String(data?.payload?.videoId || '').trim();
      resolveTrack(requestedVideoId, 1);
      return;
    }

    if (data.type === SUBTITLE_FETCH_REQUEST_TYPE) {
      const requestId = String(data?.payload?.requestId || '').trim();
      const requestUrl = String(data?.payload?.url || '').trim();
      if (!requestId || !requestUrl) return;
      fetchSubtitleFromPage(requestId, requestUrl);
    }
  }

  function isAllowedYoutubeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, window.location.origin);
      const host = String(url.hostname || '').toLowerCase();
      return (
        host === 'youtube.com' ||
        host.endsWith('.youtube.com') ||
        host === 'youtube-nocookie.com' ||
        host.endsWith('.youtube-nocookie.com')
      );
    } catch (_) {
      return false;
    }
  }

  function detectHtmlReason(rawText) {
    const text = String(rawText || '').toLowerCase();
    if (!text) return 'UNKNOWN_HTML';
    if (
      text.includes('consent.youtube.com') ||
      text.includes('before you continue') ||
      text.includes('consent.google.com') ||
      text.includes('consent.googleusercontent.com')
    ) {
      return 'CONSENT_REQUIRED';
    }
    if (
      text.includes('/sorry/') ||
      text.includes('google.com/sorry') ||
      text.includes('/sorry/index') ||
      text.includes('captcha') ||
      text.includes('unusual traffic') ||
      text.includes('recaptcha') ||
      text.includes('our systems have detected unusual traffic') ||
      text.includes('pardon the interruption')
    ) {
      return 'CAPTCHA_DETECTED';
    }
    if (
      text.includes('sign in') ||
      text.includes('accounts.google.com') ||
      text.includes('servicelogin')
    ) {
      return 'LOGIN_REQUIRED';
    }
    return 'UNKNOWN_HTML';
  }

  function isLikelyHtmlResponse(contentType, rawText) {
    const ct = String(contentType || '').toLowerCase();
    const head = String(rawText || '')
      .slice(0, 2000)
      .toLowerCase();
    if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return true;
    return (
      head.includes('<!doctype html') ||
      head.includes('<html') ||
      head.includes('consent.youtube.com') ||
      head.includes('before you continue') ||
      head.includes('consent.googleusercontent.com') ||
      head.includes('google.com/sorry') ||
      head.includes('/sorry/index') ||
      head.includes('our systems have detected unusual traffic') ||
      head.includes('pardon the interruption') ||
      head.includes('servicelogin') ||
      head.includes('youtube.com/error') ||
      head.includes('www.youtube.com/error') ||
      head.includes('captcha') ||
      head.includes('sign in')
    );
  }

  async function fetchSubtitleFromPage(requestId, requestUrl) {
    if (!isAllowedYoutubeUrl(requestUrl)) {
      emitSubtitleFetchResult({
        requestId,
        ok: false,
        status: 0,
        contentType: '',
        text: '',
        error: '请求地址不在允许范围内',
        source: 'INJECTED_FETCH',
        elapsedMs: 0,
        isHtml: false,
        reason: ''
      });
      return;
    }

    const startAt = Date.now();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      controller.abort(new DOMException('Timeout', 'AbortError'));
    }, FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'text/vtt,application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
        }
      });
      const text = await res.text();
      const contentType = String(res.headers.get('content-type') || '');
      const isHtml = isLikelyHtmlResponse(contentType, text);
      const reason = isHtml ? detectHtmlReason(text) : '';
      const htmlSnippet = isHtml
        ? String(text || '')
            .replace(/\s+/g, ' ')
            .slice(0, 200)
        : '';
      emitSubtitleFetchResult({
        requestId,
        ok: res.ok,
        status: Number(res.status || 0),
        contentType,
        text,
        source: 'INJECTED_FETCH',
        elapsedMs: Date.now() - startAt,
        isHtml,
        reason,
        htmlSnippet
      });
    } catch (err) {
      const message =
        err?.name === 'AbortError'
          ? `页面请求超时（>${FETCH_TIMEOUT_MS}ms）`
          : String(err?.message || err || '页面请求失败');
      emitSubtitleFetchResult({
        requestId,
        ok: false,
        status: 0,
        contentType: '',
        text: '',
        error: message,
        source: 'INJECTED_FETCH',
        elapsedMs: Date.now() - startAt,
        isHtml: false,
        reason: '',
        htmlSnippet: ''
      });
    } finally {
      window.clearTimeout(timer);
    }
  }

  function emitSubtitleFetchResult(payload) {
    window.postMessage(
      {
        type: SUBTITLE_FETCH_RESPONSE_TYPE,
        payload
      },
      '*'
    );
  }

  window.addEventListener('message', handleWindowMessage, false);
  resolveTrack('', 1);
})();
