const axios = require('axios');
const { get } = require('request').defaults({ encoding: null });

// Instagram GraphQL API endpoints
const normalizeInstagramBaseUrl = (raw) => {
  const fallback = 'https://instagram.com';
  if (!raw) return fallback;
  const s = String(raw).trim();
  if (!s) return fallback;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = (u.hostname || '').replace(/^www\./i, '');
    if (!host) return fallback;
    return `${u.protocol}//${host}`;
  } catch (_) {
    return fallback;
  }
};

const INSTAGRAM_BASE_URL = normalizeInstagramBaseUrl(process.env.INSTAGRAM_BASE_URL).replace(/\/+$/, '');
const INSTAGRAM_GRAPHQL_URL = `${INSTAGRAM_BASE_URL}/api/v1/users/web_profile_info/`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const RAPIDAPI_KEY = String(process.env.RAPIDAPI_KEY || '').trim();
const RAPIDAPI_HOST = String(process.env.RAPIDAPI_HOST || '').trim();
const RAPIDAPI_BASE_URL = String(process.env.RAPIDAPI_BASE_URL || '').trim();

const INSTAGRAM_USER_INFO_URL = String(process.env.INSTAGRAM_USER_INFO_URL || '').trim();
const INSTAGRAM_USER_TAGGED_POSTS_URL = String(process.env.INSTAGRAM_USER_TAGGED_POSTS_URL || '').trim();
const RAPIDAPI_USERNAME_PARAM = String(process.env.RAPIDAPI_USERNAME_PARAM || 'username').trim() || 'username';

const INSTAGRAM_HTTP_TIMEOUT_MS = Number(process.env.INSTAGRAM_HTTP_TIMEOUT_MS) > 0
  ? Number(process.env.INSTAGRAM_HTTP_TIMEOUT_MS)
  : 8000;

const RAPIDAPI_HTTP_TIMEOUT_MS = Number(process.env.RAPIDAPI_TIMEOUT_MS) > 0
  ? Number(process.env.RAPIDAPI_TIMEOUT_MS)
  : 15000;

const getRapidApiBaseUrl = () => {
  const host = RAPIDAPI_HOST || '';
  const base = RAPIDAPI_BASE_URL || (host ? `https://${host}` : '');
  if (!base) return '';
  return base.replace(/\/+$/, '');
};

const rapidApiGet = async (path, params) => {
  const base = getRapidApiBaseUrl();
  if (!base || !RAPIDAPI_KEY) {
    const err = new Error('RapidAPI not configured');
    err.code = 'RAPIDAPI_NOT_CONFIGURED';
    throw err;
  }

  const p = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  const url = `${base}${p}`;

  const headers = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
  };
  if (RAPIDAPI_HOST) headers['X-RapidAPI-Host'] = RAPIDAPI_HOST;

  return axios.get(url, {
    headers,
    params: params || {},
    timeout: RAPIDAPI_HTTP_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 500,
  });
};

const rapidApiGetUrl = async (urlStr, params) => {
  const url = String(urlStr || '').trim();
  if (!url || !RAPIDAPI_KEY) {
    const err = new Error('RapidAPI not configured');
    err.code = 'RAPIDAPI_NOT_CONFIGURED';
    throw err;
  }

  let hostFromUrl = '';
  try {
    hostFromUrl = new URL(url).host;
  } catch (_) {
    hostFromUrl = '';
  }

  const headers = {
    'X-RapidAPI-Key': RAPIDAPI_KEY,
  };
  headers['X-RapidAPI-Host'] = RAPIDAPI_HOST || hostFromUrl;

  return axios.get(url, {
    headers,
    params: params || {},
    timeout: RAPIDAPI_HTTP_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 500,
  });
};

const findFirstOkRapidApiResponse = async (paths, params) => {
  let lastErr = null;
  for (const p of paths) {
    try {
      const res = await rapidApiGet(p, params);
      if (res?.status >= 200 && res?.status < 300) return res.data;
      lastErr = new Error(`RapidAPI responded with status ${res?.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('RapidAPI request failed');
};

const normalizeRapidApiUserInfo = (raw, usernameFallback) => {
  const toNum = (v, fallback = 0) => {
    if (v == null || v === '') return fallback;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : fallback;
  };

  const user = raw?.user || raw?.data?.user || raw?.result?.user || raw?.profile || raw;
  const username = user?.username || usernameFallback || '';
  return {
    username,
    full_name: user?.full_name || user?.fullName || user?.name || username,
    followers_count: toNum(user?.follower_count ?? user?.followers_count ?? user?.followers, 0),
    following_count: toNum(user?.following_count ?? user?.following, 0),
    post_count: toNum(user?.media_count ?? user?.post_count ?? user?.posts, 0),
    profile_pic_url: user?.profile_pic_url_hd || user?.profile_pic_url || user?.profilePicUrl || '',
    is_private: user?.is_private ?? user?.private ?? false,
    is_verified: user?.is_verified ?? user?.verified ?? false,
    bio: user?.biography || user?.bio || '',
    external_url: user?.external_url || user?.externalUrl || '',
  };
};

const normalizeRapidApiTaggedPosts = (raw) => {
  const list = Array.isArray(raw?.tagged_posts) ? raw.tagged_posts : Array.isArray(raw?.data?.tagged_posts) ? raw.data.tagged_posts : [];
  const posts = list
    .map((x) => x?.node || x)
    .filter(Boolean);

  const take = posts.slice(0, 12);
  const totalLikes = take.reduce((sum, p) => sum + (Number(p?.like_count) || 0), 0);
  const totalComments = take.reduce((sum, p) => sum + (Number(p?.comment_count) || 0), 0);
  const avgLikes = take.length ? totalLikes / take.length : 0;
  const avgComments = take.length ? totalComments / take.length : 0;

  const firstUser = posts[0]?.user || null;
  const username = firstUser?.username || '';

  const mapped = posts.map((p) => ({
    pk: p?.pk || p?.id || '',
    code: p?.code || '',
    media_type: p?.media_type,
    caption: p?.caption?.text || '',
    like_count: Number(p?.like_count) || 0,
    comment_count: Number(p?.comment_count) || 0,
    display_url: p?.display_url || p?.display_uri || p?.image_versions2?.candidates?.[0]?.url || '',
    user: p?.user ? { username: p.user.username, id: p.user.id || p.user.pk } : null,
    created_at: p?.taken_at || p?.taken_at_timestamp || null,
  }));

  return {
    username,
    tagged_posts: mapped,
    pagination_token: raw?.pagination_token || raw?.next_max_id || raw?.next_cursor || null,
    average_likes: Math.round(avgLikes) || 0,
    average_comments: Math.round(avgComments) || 0,
  };
};

const fetchRapidApiProfile = async (username) => {
  const u = String(username || '').trim();
  if (!u) throw new Error('Username is required');

  const params = {
    [RAPIDAPI_USERNAME_PARAM]: u,
    username: u,
    username_or_id_or_url: u,
  };

  // Prefer explicit, tested URLs from env (recommended)
  if (INSTAGRAM_USER_INFO_URL || INSTAGRAM_USER_TAGGED_POSTS_URL) {
    let userInfo = null;
    let tagged = null;

    if (INSTAGRAM_USER_INFO_URL) {
      try {
        const res = await rapidApiGetUrl(INSTAGRAM_USER_INFO_URL, params);
        if (res?.status >= 200 && res?.status < 300) {
          userInfo = normalizeRapidApiUserInfo(res.data, u);
        } else {
          const err = new Error(`RapidAPI user_info failed (status ${res?.status})`);
          err.status = res?.status;
          err.data = res?.data;
          throw err;
        }
      } catch (e) {
        console.error('RapidAPI user_info failed:', e.message);
        throw e;
      }
    }
    if (!userInfo) {
      const err = new Error('RapidAPI user_info request failed');
      err.code = 'RAPIDAPI_USER_INFO_FAILED';
      throw err;
    }

    if (INSTAGRAM_USER_TAGGED_POSTS_URL) {
      try {
        const res = await rapidApiGetUrl(INSTAGRAM_USER_TAGGED_POSTS_URL, params);
        if (res?.status >= 200 && res?.status < 300) {
          tagged = normalizeRapidApiTaggedPosts(res.data);
        }
      } catch (e) {
        console.warn('RapidAPI tagged_posts failed:', e.message);
        // Do not fail the whole request if tagged posts fails.
      }
    }
    if (!tagged) tagged = { username: u, tagged_posts: [], pagination_token: null, average_likes: null, average_comments: null };

    const followers = Number(userInfo.followers_count);
    const baseFollowers = Number.isFinite(followers) && followers > 0 ? followers : 0;
    const avgLikes = Number(tagged?.average_likes);
    const avgComments = Number(tagged?.average_comments);
    const avgLikesSafe = Number.isFinite(avgLikes) ? avgLikes : 0;
    const avgCommentsSafe = Number.isFinite(avgComments) ? avgComments : 0;
    const engagementRate = baseFollowers > 0
      ? Number((((avgLikesSafe + avgCommentsSafe) / baseFollowers) * 100).toFixed(2))
      : null;

    return {
      username: userInfo.username || tagged.username || u,
      full_name: userInfo.full_name || (userInfo.username || tagged.username || u),
      followers_count: Number(userInfo.followers_count) || 0,
      following_count: Number(userInfo.following_count) || 0,
      post_count: Number(userInfo.post_count) || 0,
      engagement_rate: engagementRate,
      profile_pic_url: userInfo.profile_pic_url || '',
      is_private: !!userInfo.is_private,
      is_verified: !!userInfo.is_verified,
      bio: userInfo.bio || '',
      external_url: userInfo.external_url || '',
      average_likes: tagged.average_likes || 0,
      average_comments: tagged.average_comments || 0,
      tagged_posts: tagged.tagged_posts,
      pagination_token: tagged.pagination_token,
    };
  }

  const userInfoPaths = String(process.env.RAPIDAPI_IG_USER_INFO_PATHS || '').trim()
    ? String(process.env.RAPIDAPI_IG_USER_INFO_PATHS || '').split(',').map((s) => s.trim()).filter(Boolean)
    : [
      '/user_info',
      '/user/info',
      '/user',
      '/profile',
    ];

  const taggedPaths = String(process.env.RAPIDAPI_IG_TAGGED_POSTS_PATHS || '').trim()
    ? String(process.env.RAPIDAPI_IG_TAGGED_POSTS_PATHS || '').split(',').map((s) => s.trim()).filter(Boolean)
    : [
      '/user_tagged_posts',
      '/user/tagged_posts',
      '/tagged_posts',
    ];

  let userInfo = null;
  try {
    const rawInfo = await findFirstOkRapidApiResponse(userInfoPaths, params);
    userInfo = normalizeRapidApiUserInfo(rawInfo, u);
  } catch (e) {
    console.error('RapidAPI user_info failed:', e.message);
    throw e;
  }

  let tagged = null;
  try {
    const rawTagged = await findFirstOkRapidApiResponse(taggedPaths, params);
    tagged = normalizeRapidApiTaggedPosts(rawTagged);
  } catch (e) {
    console.warn('RapidAPI tagged_posts failed:', e.message);
    tagged = { username: u, tagged_posts: [], pagination_token: null, average_likes: 0, average_comments: 0 };
  }

  const followers = Number(userInfo.followers_count);
  const baseFollowers = Number.isFinite(followers) && followers > 0 ? followers : 0;
  const engagementRate = baseFollowers > 0
    ? Number((((tagged.average_likes + tagged.average_comments) / baseFollowers) * 100).toFixed(2))
    : 0;

  return {
    username: userInfo.username || tagged.username || u,
    full_name: userInfo.full_name || (userInfo.username || tagged.username || u),
    followers_count: Number(userInfo.followers_count) || 0,
    following_count: Number(userInfo.following_count) || 0,
    post_count: Number(userInfo.post_count) || 0,
    engagement_rate: engagementRate,
    profile_pic_url: userInfo.profile_pic_url || '',
    is_private: !!userInfo.is_private,
    is_verified: !!userInfo.is_verified,
    bio: userInfo.bio || '',
    external_url: userInfo.external_url || '',
    average_likes: tagged.average_likes || 0,
    average_comments: tagged.average_comments || 0,
    tagged_posts: tagged.tagged_posts,
    pagination_token: tagged.pagination_token,
  };
};

const toggleInstagramWww = (urlStr) => {
  try {
    const u = new URL(urlStr);
    const host = u.hostname || '';
    if (!host) return urlStr;
    u.hostname = host.toLowerCase().startsWith('www.') ? host.slice(4) : `www.${host}`;
    return u.toString();
  } catch (_) {
    return urlStr;
  }
};

const axiosGetWithDnsFallback = async (url, config) => {
  try {
    return await axios.get(url, config);
  } catch (err) {
    const msg = String(err?.message || '');
    if (err?.code === 'ENOTFOUND' || msg.includes('getaddrinfo ENOTFOUND')) {
      const alt = toggleInstagramWww(url);
      if (alt && alt !== url) {
        return await axios.get(alt, config);
      }
    }
    throw err;
  }
};

const fetchWebProfileInfoNoAuth = async (username) => {
  const headers = {
    'User-Agent': USER_AGENT,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `${INSTAGRAM_BASE_URL}/${encodeURIComponent(username)}/`,
    'Origin': INSTAGRAM_BASE_URL,
  };

  const initialUrl = `${INSTAGRAM_GRAPHQL_URL}?username=${encodeURIComponent(username)}`;
  const response = await axiosGetWithDnsFallback(initialUrl, {
    headers,
    maxRedirects: 0,
    timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  let data = null;
  if (response.status >= 300) {
    const location = response.headers?.location || '';
    const loc = String(location).toLowerCase();
    if (loc.includes('login') || loc.includes('challenge')) {
      const err = new Error('Instagram redirected to login/challenge');
      err.code = 'IG_REDIRECT';
      err.redirect = location;
      throw err;
    }

    try {
      const next = new URL(location, INSTAGRAM_BASE_URL);
      if (!next.hostname.endsWith('instagram.com')) {
        const err = new Error('Instagram redirected');
        err.code = 'IG_REDIRECT';
        err.redirect = location;
        throw err;
      }

      const resp2 = await axiosGetWithDnsFallback(next.toString(), {
        headers,
        maxRedirects: 0,
        timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      if (resp2.status >= 300) {
        const err = new Error('Instagram redirected');
        err.code = 'IG_REDIRECT';
        err.redirect = resp2.headers?.location || location;
        throw err;
      }
      data = resp2.data;
    } catch (e) {
      if (e?.code === 'IG_REDIRECT') throw e;
      const err = new Error('Instagram redirected');
      err.code = 'IG_REDIRECT';
      err.redirect = location;
      throw err;
    }
  } else {
    data = response.data;
  }

  const userData = data?.data?.user;
  if (!userData) {
    throw new Error('User data not found in response');
  }

  return {
    username: userData.username,
    full_name: userData.full_name || userData.username,
    followers_count: userData.edge_followed_by?.count || 0,
    following_count: userData.edge_follow?.count || 0,
    post_count: userData.edge_owner_to_timeline_media?.count || 0,
    engagement_rate: 0,
    profile_pic_url: userData.profile_pic_url_hd || userData.profile_pic_url || '',
    is_private: userData.is_private || false,
    is_verified: userData.is_verified || false,
    bio: userData.biography || '',
    external_url: userData.external_url || '',
    average_likes: 0,
    average_comments: 0,
  };
};

const fetchPublicInstagramProfile = async (username) => {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const initialUrl = `${INSTAGRAM_BASE_URL}/${encodeURIComponent(username)}/`;
  const response = await axiosGetWithDnsFallback(initialUrl, {
    headers,
    maxRedirects: 0,
    timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  let html = null;
  if (response.status >= 300) {
    const location = response.headers?.location || '';
    const loc = String(location).toLowerCase();
    if (loc.includes('login') || loc.includes('challenge')) {
      const err = new Error('Instagram redirected to login/challenge');
      err.code = 'IG_REDIRECT';
      err.redirect = location;
      throw err;
    }

    try {
      const next = new URL(location, INSTAGRAM_BASE_URL);
      if (next.hostname.endsWith('instagram.com')) {
        const resp2 = await axiosGetWithDnsFallback(next.toString(), {
          headers,
          maxRedirects: 0,
          timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        if (resp2.status >= 300) {
          const err = new Error('Instagram redirected');
          err.code = 'IG_REDIRECT';
          err.redirect = resp2.headers?.location || location;
          throw err;
        }
        html = String(resp2.data || '');
      } else {
        const err = new Error('Instagram redirected');
        err.code = 'IG_REDIRECT';
        err.redirect = location;
        throw err;
      }
    } catch (e) {
      if (e?.code === 'IG_REDIRECT') throw e;
      const err = new Error('Instagram redirected');
      err.code = 'IG_REDIRECT';
      err.redirect = location;
      throw err;
    }
  } else {
    html = String(response.data || '');
  }

  const ogDescMatch = html.match(/property="og:description"\s+content="([^"]*)"/i);
  const metaDescMatch = html.match(/name="description"\s+content="([^"]*)"/i);
  const desc = decodeHtmlEntities((ogDescMatch && ogDescMatch[1]) || (metaDescMatch && metaDescMatch[1]) || '');

  const findCount = (patterns) => {
    for (const p of patterns) {
      const m = html.match(p);
      if (m && m[1] != null) {
        const n = Number(String(m[1]).replace(/,/g, ''));
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  let followers = 0;
  const followersFromJson = findCount([
    /"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"follower_count"\s*:\s*(\d+)/i,
  ]);
  if (followersFromJson != null) {
    followers = followersFromJson;
  } else {
    const followersMatch = desc.match(/([0-9.,]+\s*[kKmMbB]?)\s+Followers/i);
    if (followersMatch) followers = parseAbbreviatedNumber(followersMatch[1]);
  }

  const following = findCount([
    /"edge_follow"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"following_count"\s*:\s*(\d+)/i,
  ]) ?? 0;

  const posts = findCount([
    /"edge_owner_to_timeline_media"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i,
    /"media_count"\s*:\s*(\d+)/i,
  ]) ?? 0;

  const fullNameMatch = html.match(/property="og:title"\s+content="([^"]*)"/i);
  const ogTitle = decodeHtmlEntities((fullNameMatch && fullNameMatch[1]) || '');
  const fullName = ogTitle.split('(@')[0].trim();

  const bioMatch = html.match(/\"biography\"\s*:\s*\"([^\"]*)\"/i);
  const bio = decodeJsonEscapes((bioMatch && bioMatch[1]) || '');

  const picMatch = html.match(/\"profile_pic_url_hd\"\s*:\s*\"([^\"]+)\"/i) || html.match(/\"profile_pic_url\"\s*:\s*\"([^\"]+)\"/i);
  const profilePic = decodeJsonEscapes((picMatch && picMatch[1]) || '');

  const isPrivateMatch = html.match(/\"is_private\"\s*:\s*(true|false)/i);
  const isPrivate = isPrivateMatch ? String(isPrivateMatch[1]).toLowerCase() === 'true' : false;

  const isVerifiedMatch = html.match(/\"is_verified\"\s*:\s*(true|false)/i);
  const isVerified = isVerifiedMatch ? String(isVerifiedMatch[1]).toLowerCase() === 'true' : false;

  return {
    username,
    full_name: fullName || username,
    followers_count: followers,
    following_count: following,
    post_count: posts,
    engagement_rate: 0,
    profile_pic_url: profilePic,
    is_private: isPrivate,
    is_verified: isVerified,
    bio,
    external_url: '',
    average_likes: 0,
    average_comments: 0,
  };
};

const getCSRFToken = async () => {
  try {
    const cookieCsrf = getCookieValue(INSTAGRAM_COOKIE, 'csrftoken');
    if (cookieCsrf) return cookieCsrf;

    const response = await axiosGetWithDnsFallback(`${INSTAGRAM_BASE_URL}/`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      maxRedirects: 0,
      timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status >= 300) {
      const location = response.headers?.location;
      if (location) {
        try {
          const next = new URL(location, INSTAGRAM_BASE_URL);
          if (next.hostname.endsWith('instagram.com')) {
            const resp2 = await axiosGetWithDnsFallback(next.toString(), {
              headers: {
                'User-Agent': USER_AGENT,
              },
              maxRedirects: 0,
              timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
              validateStatus: (status) => status >= 200 && status < 400,
            });

            if (resp2.status >= 300) return '';
            const cookies2 = resp2.headers['set-cookie'] || [];
            const csrf2 = cookies2
              .find(cookie => cookie.includes('csrftoken='))
              ?.split(';')[0]
              .split('=')[1];
            return csrf2 || '';
          }
        } catch (_) {
          return '';
        }
      }
      return '';
    }

    const cookies = response.headers['set-cookie'] || [];
    const csrfToken = cookies
      .find(cookie => cookie.includes('csrftoken='))
      ?.split(';')[0]
      .split('=')[1];

    return csrfToken || '';
  } catch (error) {
    console.error('Error getting CSRF token:', error.message);
    return '';
  }
};

const INSTAGRAM_CACHE_TTL_MS = Number(process.env.INSTAGRAM_CACHE_TTL_MS) > 0
  ? Number(process.env.INSTAGRAM_CACHE_TTL_MS)
  : 6 * 60 * 60 * 1000;
const instagramCache = new Map();

const getCachedProfile = (username) => {
  const key = String(username || '').toLowerCase();
  const item = instagramCache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > INSTAGRAM_CACHE_TTL_MS) return null;
  return item.data;
};

const setCachedProfile = (username, data) => {
  const key = String(username || '').toLowerCase();
  if (!key) return;
  instagramCache.set(key, { ts: Date.now(), data });
};

const safeDecodeURIComponent = (val) => {
  const s = String(val || '').trim();
  if (!s) return '';
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
};

// Session/Cookie from Instagram browser (optional; improves reliability when public endpoints are blocked)
const SESSION_ID = safeDecodeURIComponent(process.env.INSTAGRAM_SESSION_ID || '');
const INSTAGRAM_COOKIE = String(process.env.INSTAGRAM_COOKIE || '').trim();

const normalizeUsername = (raw) => {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\/$/, '');
};

const getCookieValue = (cookieHeader, key) => {
  if (!cookieHeader) return '';
  const parts = String(cookieHeader)
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  const hit = parts.find((p) => p.toLowerCase().startsWith(`${String(key).toLowerCase()}=`));
  if (!hit) return '';
  const idx = hit.indexOf('=');
  if (idx === -1) return '';
  return hit.slice(idx + 1);
};

const decodeHtmlEntities = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
};

const decodeJsonEscapes = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

const parseAbbreviatedNumber = (raw) => {
  if (raw == null) return 0;
  const s = String(raw).trim().replace(/,/g, '');
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const val = Number(m[1]);
  if (!Number.isFinite(val)) return 0;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'k') return Math.round(val * 1e3);
  if (suffix === 'm') return Math.round(val * 1e6);
  if (suffix === 'b') return Math.round(val * 1e9);
  return Math.round(val);
};

exports.getInstagramProfile = async (req, res) => {
  try {
    const username = normalizeUsername(req.params?.username);
    if (!username || !String(username).trim()) {
      return res.json({
        ok: false,
        username: '',
        followers_count: null,
        bio: '',
        error: 'Username is required',
      });
    }

    const authConfigured = !!(SESSION_ID || INSTAGRAM_COOKIE);

    console.log('Fetching Instagram data for:', username);

    const cached = getCachedProfile(username);
    if (cached) {
      return res.json({ ...cached, ok: true, cached: true });
    }

    const rapidApiConfigured = !!(
      RAPIDAPI_KEY &&
      (
        RAPIDAPI_HOST ||
        RAPIDAPI_BASE_URL ||
        INSTAGRAM_USER_INFO_URL ||
        INSTAGRAM_USER_TAGGED_POSTS_URL
      )
    );

    if (rapidApiConfigured) {
      try {
        console.log('Trying RapidAPI for:', username);
        const rapid = await fetchRapidApiProfile(username);
        const payload = { ...rapid, ok: true, provider: 'rapidapi' };
        setCachedProfile(username, payload);
        return res.json(payload);
      } catch (e) {
        console.warn('RapidAPI failed:', e?.message || e);
      }
    }

    try {
      const publicResult = await fetchPublicInstagramProfile(username);
      const payload = { ...publicResult, ok: true };
      setCachedProfile(username, payload);
      return res.json(payload);
    } catch (publicErr) {
      console.warn('Instagram public scrape failed:', publicErr?.message || publicErr);
      try {
        const apiNoAuth = await fetchWebProfileInfoNoAuth(username);
        const payload = { ...apiNoAuth, ok: true };
        setCachedProfile(username, payload);
        return res.json(payload);
      } catch (noAuthErr) {
        console.warn('Instagram web_profile_info (no-auth) failed:', noAuthErr?.message || noAuthErr);
        if (authConfigured) {
          // fall through to authenticated fetch
        } else {
          if (rapidApiConfigured) {
            try {
              const rapid = await fetchRapidApiProfile(username);
              const payload = { ...rapid, ok: true, provider: 'rapidapi' };
              setCachedProfile(username, payload);
              return res.json(payload);
            } catch (e) {
              console.warn('RapidAPI fallback failed:', e?.message || e);
            }
          }

          throw publicErr;
        }
      }
    }

    const csrfToken = await getCSRFToken();

    if (!authConfigured) {
      return res.json({
        ok: false,
        username,
        followers_count: null,
        bio: '',
        error: 'Instagram temporarily unavailable. Try again later.',
      });
    }

    let cookieHeader = '';
    if (INSTAGRAM_COOKIE) cookieHeader = INSTAGRAM_COOKIE;
    else if (csrfToken && SESSION_ID) cookieHeader = `csrftoken=${csrfToken}; sessionid=${SESSION_ID}`;
    else if (SESSION_ID) cookieHeader = `sessionid=${SESSION_ID}`;
    else if (csrfToken) cookieHeader = `csrftoken=${csrfToken}`;

    const reqHeaders = {
      'User-Agent': USER_AGENT,
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${INSTAGRAM_BASE_URL}/`,
      'Origin': INSTAGRAM_BASE_URL,
    };
    if (csrfToken) reqHeaders['X-CSRFToken'] = csrfToken;
    if (cookieHeader) reqHeaders['Cookie'] = cookieHeader;

    console.log('Sending request to Instagram API...');
    const initialApiUrl = `${INSTAGRAM_GRAPHQL_URL}?username=${encodeURIComponent(username)}`;
    const response = await axiosGetWithDnsFallback(initialApiUrl, {
      headers: reqHeaders,
      maxRedirects: 0,
      timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    let finalResponse = response;
    if (finalResponse.status >= 300) {
      const location = finalResponse.headers?.location || '';
      const loc = String(location).toLowerCase();
      if (!loc.includes('login') && !loc.includes('challenge') && location) {
        try {
          const next = new URL(location, initialApiUrl);
          if (next.hostname.endsWith('instagram.com')) {
            const resp2 = await axiosGetWithDnsFallback(next.toString(), {
              headers: reqHeaders,
              maxRedirects: 0,
              timeout: INSTAGRAM_HTTP_TIMEOUT_MS,
              validateStatus: (status) => status >= 200 && status < 400,
            });
            finalResponse = resp2;
          }
        } catch (_) {
          // ignore
        }
      }
    }

    if (finalResponse.status >= 300) {
      const location = finalResponse.headers?.location;
      return res.json({
        ok: false,
        username,
        followers_count: null,
        bio: '',
        error: 'Instagram blocked this request (redirected). Try again later.',
        redirect: location || undefined,
      });
    }
    console.log('Instagram API response received');
    
    const userData = finalResponse.data?.data?.user;
    
    if (!userData) {
      throw new Error('User data not found in response');
    }
    
    // Get recent posts for engagement rate calculation
    let engagementRate = 0;
    let avgLikes = 0;
    let avgComments = 0;
    
    if (userData.edge_owner_to_timeline_media?.edges?.length > 0) {
      const posts = userData.edge_owner_to_timeline_media.edges.slice(0, 12);
      const totalLikes = posts.reduce((sum, { node }) => sum + (node.edge_liked_by?.count || 0), 0);
      const totalComments = posts.reduce((sum, { node }) => sum + (node.edge_media_to_comment?.count || 0), 0);
      
      avgLikes = posts.length > 0 ? totalLikes / posts.length : 0;
      avgComments = posts.length > 0 ? totalComments / posts.length : 0;
      
      if (userData.edge_followed_by?.count > 0) {
        engagementRate = ((avgLikes + avgComments) / userData.edge_followed_by.count * 100).toFixed(2);
      }
    }
    
    const result = {
      username: userData.username,
      full_name: userData.full_name || userData.username,
      followers_count: userData.edge_followed_by?.count || 0,
      following_count: userData.edge_follow?.count || 0,
      post_count: userData.edge_owner_to_timeline_media?.count || 0,
      engagement_rate: parseFloat(engagementRate) || 0,
      profile_pic_url: userData.profile_pic_url_hd || userData.profile_pic_url || '',
      is_private: userData.is_private || false,
      is_verified: userData.is_verified || false,
      bio: userData.biography || '',
      external_url: userData.external_url || '',
      average_likes: Math.round(avgLikes) || 0,
      average_comments: Math.round(avgComments) || 0
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Raw API response:', JSON.stringify(userData, null, 2));
    }
    
    console.log('Successfully fetched data for:', username);
    const payload = { ...result, ok: true };
    setCachedProfile(username, payload);
    return res.json(payload);
    
  } catch (err) {
    console.error('Instagram API Error:', err.message);

    const rapidApiConfigured = !!(
      RAPIDAPI_KEY &&
      (
        RAPIDAPI_HOST ||
        RAPIDAPI_BASE_URL ||
        INSTAGRAM_USER_INFO_URL ||
        INSTAGRAM_USER_TAGGED_POSTS_URL
      )
    );
    if (rapidApiConfigured) {
      try {
        const username = normalizeUsername(req.params?.username);
        const cached = getCachedProfile(username);
        if (!cached || cached?.provider !== 'rapidapi') {
          const rapid = await fetchRapidApiProfile(username);
          const payload = { ...rapid, ok: true, provider: 'rapidapi' };
          setCachedProfile(username, payload);
          return res.json(payload);
        }
      } catch (_) {
        // ignore
      }
    }

    const fallback = getCachedProfile(req.params?.username) || null;
    if (fallback) {
      return res.json({ ...fallback, ok: false, stale: true, error: 'Instagram temporarily unavailable. Showing last cached data.' });
    }
    
    if (err?.code === 'IG_REDIRECT') {
      return res.json({
        ok: false,
        username: normalizeUsername(req.params?.username),
        followers_count: null,
        bio: '',
        error: 'Instagram redirected to login/challenge. Try again later.',
      });
    }

    if (err?.code === 'ENOTFOUND' || String(err?.message || '').includes('getaddrinfo ENOTFOUND')) {
      return res.json({
        ok: false,
        username: normalizeUsername(req.params?.username),
        followers_count: null,
        bio: '',
        error: 'Instagram DNS/network issue on server. Please try again later.',
      });
    }
    
    if (String(err?.message || '').toLowerCase().includes('maximum number of redirects exceeded')) {
      return res.json({
        ok: false,
        username: normalizeUsername(req.params?.username),
        followers_count: null,
        bio: '',
        error: 'Instagram redirected too many times. Try again later.',
      });
    }
    
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);

      if ([301, 302, 303, 307, 308].includes(err.response.status)) {
        return res.json({
          ok: false,
          username: normalizeUsername(req.params?.username),
          followers_count: null,
          bio: '',
          error: 'Instagram redirected the request. Try again later.',
        });
      }
      
      if (err.response.status === 401) {
        return res.json({
          ok: false,
          username: normalizeUsername(req.params?.username),
          followers_count: null,
          bio: '',
          error: 'Instagram temporarily blocking requests. Try again later.',
        });
      }
      
      if (err.response.status === 404) {
        return res.json({
          ok: false,
          username: normalizeUsername(req.params?.username),
          followers_count: null,
          bio: '',
          error: 'Instagram user not found (or private).',
        });
      }
      
      if (err.response.status === 429) {
        return res.json({
          ok: false,
          username: normalizeUsername(req.params?.username),
          followers_count: null,
          bio: '',
          error: 'Instagram rate-limited. Try again later.',
        });
      }
      
      return res.json({
        ok: false,
        username: normalizeUsername(req.params?.username),
        followers_count: null,
        bio: '',
        error: err.response.data?.message || 'Failed to fetch Instagram data',
      });
    }
    
    return res.json({
      ok: false,
      username: normalizeUsername(req.params?.username),
      followers_count: null,
      bio: '',
      error: err.message || 'Failed to fetch Instagram data',
    });
  }
};