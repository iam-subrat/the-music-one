/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {                                                                                                                          
  async fetch(request) {                                                                                                                  
    const url = new URL(request.url);  
    const musicUrl = url.searchParams.get('url');                                                                                         
                
    if (!musicUrl) {                   
      return new Response(JSON.stringify({ error: 'missing url param' }), {
        status: 400,                                                                                                                      
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });                                                                                                                                 
    }          
                                                                                                                                          
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(musicUrl)}`
    );                                                                                                                                    
    const data = await res.text();
                                                                                                                                          
    return new Response(data, {
      status: res.status,              
      headers: {                                                                                                                          
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',                                                                                               
      },       
    });                                
  },
};