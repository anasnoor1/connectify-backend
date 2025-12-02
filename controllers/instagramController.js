const axios = require('axios');
const { get } = require('request').defaults({ encoding: null });

// Instagram GraphQL API endpoints
const INSTAGRAM_GRAPHQL_URL = 'https://www.instagram.com/api/v1/users/web_profile_info/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Session ID from Instagram (you'll need to get this from browser cookies)
const SESSION_ID = process.env.INSTAGRAM_SESSION_ID || '';

// Helper function to get CSRF token
const getCSRFToken = async () => {
  try {
    const response = await axios.get('https://www.instagram.com/', {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    
    const csrfToken = response.headers['set-cookie']
      .find(cookie => cookie.includes('csrftoken='))
      ?.split(';')[0]
      .split('=')[1];
      
    return csrfToken || '';
  } catch (error) {
    console.error('Error getting CSRF token:', error.message);
    return '';
  }
};

exports.getInstagramProfile = async (req, res) => {
  try {
    const { username } = req.params;
    if (!username || !String(username).trim()) {
      return res.status(400).json({ message: 'Username is required' });
    }
    
    if (!SESSION_ID) {
      console.error('Instagram integration not configured: INSTAGRAM_SESSION_ID is missing');
      return res.status(503).json({
        message: 'Instagram integration is temporarily unavailable',
        error: 'Instagram access is not configured. Please try again later.'
      });
    }

    console.log('Fetching Instagram data for:', username);
    
    // Get CSRF token first
    const csrfToken = await getCSRFToken();
    
    // Make request to Instagram's GraphQL endpoint
    console.log('Sending request to Instagram API...');
    const response = await axios.get(`${INSTAGRAM_GRAPHQL_URL}?username=${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'X-IG-App-ID': '936619743392459', // This is the public web client ID
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrfToken,
        'Cookie': `csrftoken=${csrfToken}${SESSION_ID ? '; sessionid=' + SESSION_ID : ''}`,
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
      },
    });
    console.log('Instagram API response received');
    
    const userData = response.data?.data?.user;
    
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
    return res.json(result);
    
  } catch (err) {
    console.error('Instagram API Error:', err.message);
    
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
      
      if (err.response.status === 401) {
        return res.status(503).json({
          message: 'Instagram service temporarily unavailable',
          error: 'Instagram is temporarily blocking requests. Please wait a few minutes and try again.'
        });
      }
      
      if (err.response.status === 404) {
        return res.status(404).json({ 
          message: 'Instagram user not found',
          error: 'The specified Instagram username does not exist or is private.'
        });
      }
      
      if (err.response.status === 429) {
        return res.status(429).json({
          message: 'Rate limit exceeded',
          error: 'Too many requests. Please try again later.'
        });
      }
      
      return res.status(err.response.status).json({
        message: 'Failed to fetch Instagram profile',
        error: err.response.data?.message || 'An error occurred while fetching Instagram data'
      });
    }
    
    return res.status(500).json({
      message: 'Failed to fetch Instagram profile',
      error: err.message || 'An unknown error occurred'
    });
  }
};