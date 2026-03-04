async function req(path, opts={}) {
  const r = await fetch(`/api${path}`, { credentials:"include", headers:{"Content-Type":"application/json",...opts.headers}, ...opts });
  if (r.status===204) return null;
  const d = await r.json();
  if (!r.ok) {
    const err = new Error(d.error||`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return d;
}
export const auth = {
  providers:()=>req("/auth/providers"),
  login:(u,p)=>req("/auth/login",{method:"POST",body:JSON.stringify({username:u,password:p})}),
  me:()=>req("/auth/me"),
  logout:()=>req("/auth/logout",{method:"POST"}),
  onboard:(username,displayName)=>req("/auth/onboard",{method:"POST",body:JSON.stringify({username,displayName})}),
  changeUsername:u=>req("/auth/change-username",{method:"POST",body:JSON.stringify({username:u})}),
  changePassword:(cur,newP)=>req("/auth/change-password",{method:"POST",body:JSON.stringify({currentPassword:cur,newPassword:newP})}),
  profile:u=>req(`/auth/profile/${u}`),
  updateProfile:d=>req("/auth/profile",{method:"PUT",body:JSON.stringify(d)}),
};
export const works = {
  list:()=>req("/works"),
  get:s=>req(`/works/${s}`),
  searchText:(q, workSlug="")=>req(`/works/search/text?q=${encodeURIComponent(q)}${workSlug ? `&work=${encodeURIComponent(workSlug)}` : ""}`),
};
export const annotations = {
  forWork:(s,filter)=>req(`/annotations/${s}${filter?`?filter=${filter}`:""}`),
  myAll:(q)=>req(`/annotations/my/all${q?`?q=${encodeURIComponent(q)}`:""}`),
  create:d=>req("/annotations",{method:"POST",body:JSON.stringify(d)}),
  update:(id,d)=>req(`/annotations/${id}`,{method:"PUT",body:JSON.stringify(d)}),
  delete:id=>req(`/annotations/${id}`,{method:"DELETE"}),
};
export const bookmarks = {
  forWork:s=>req(`/bookmarks/${s}`),
  myAll:()=>req("/bookmarks"),
  set:(s,lineId,lineText)=>req(`/bookmarks/${s}`,{method:"POST",body:JSON.stringify({lineId,lineText})}),
  remove:s=>req(`/bookmarks/${s}`,{method:"DELETE"}),
};
export const annotationDetail = {
  get:id=>req(`/annotation-detail/${id}`),
  postComment:(id,body,parentId)=>req(`/annotation-detail/${id}/comments`,{method:"POST",body:JSON.stringify({body,parentId})}),
  editComment:(cid,body)=>req(`/annotation-detail/comments/${cid}`,{method:"PUT",body:JSON.stringify({body})}),
  deleteComment:cid=>req(`/annotation-detail/comments/${cid}`,{method:"DELETE"}),
  suggest:(id,d)=>req(`/annotation-detail/${id}/suggestions`,{method:"POST",body:JSON.stringify(d)}),
  acceptSuggestion:sid=>req(`/annotation-detail/suggestions/${sid}/accept`,{method:"POST"}),
  rejectSuggestion:sid=>req(`/annotation-detail/suggestions/${sid}/reject`,{method:"POST"}),
};
export const discussions = {
  forWork:s=>req(`/discussions/${s}`),
  post:(s,body,parentId)=>req(`/discussions/${s}`,{method:"POST",body:JSON.stringify({body,parentId})}),
  edit:(id,body)=>req(`/discussions/${id}`,{method:"PUT",body:JSON.stringify({body})}),
  delete:id=>req(`/discussions/${id}`,{method:"DELETE"}),
};
export const forum = {
  tags:()=>req("/forum/tags"),
  list:(tag,search)=>{const p=new URLSearchParams();if(tag)p.set("tag",tag);if(search)p.set("search",search);return req(`/forum?${p}`);},
  get:id=>req(`/forum/${id}`),
  create:(title,body,tagIds)=>req("/forum",{method:"POST",body:JSON.stringify({title,body,tagIds})}),
  edit:(id,d)=>req(`/forum/${id}`,{method:"PUT",body:JSON.stringify(d)}),
  reply:(id,body,parentId)=>req(`/forum/${id}/reply`,{method:"POST",body:JSON.stringify({body,parentId})}),
  editReply:(id,body)=>req(`/forum/reply/${id}`,{method:"PUT",body:JSON.stringify({body})}),
  deleteThread:id=>req(`/forum/thread/${id}`,{method:"DELETE"}),
  deleteReply:id=>req(`/forum/reply/${id}`,{method:"DELETE"}),
};
export const blog = {
  list:()=>req("/blog"),
  get:id=>req(`/blog/${id}`),
  create:(title,body,headerImage)=>req("/blog",{method:"POST",body:JSON.stringify({title,body,headerImage})}),
  edit:(id,d)=>req(`/blog/${id}`,{method:"PUT",body:JSON.stringify(d)}),
  reply:(id,body,parentId)=>req(`/blog/${id}/reply`,{method:"POST",body:JSON.stringify({body,parentId})}),
  editReply:(id,body)=>req(`/blog/reply/${id}`,{method:"PUT",body:JSON.stringify({body})}),
  delete:id=>req(`/blog/${id}`,{method:"DELETE"}),
  deleteReply:id=>req(`/blog/reply/${id}`,{method:"DELETE"}),
  uploadImage:(fileName,mimeType,dataUrl)=>req("/blog/upload-image",{method:"POST",body:JSON.stringify({fileName,mimeType,dataUrl})}),
};
export const reports = {
  create:(targetType,targetId,reason,details)=>req("/reports",{method:"POST",body:JSON.stringify({targetType,targetId,reason,details})}),
  list:()=>req("/reports"),
  resolve:id=>req(`/reports/${id}/resolve`,{method:"POST"}),
};
export const analytics = {
  event:(eventType, payload={})=>req("/analytics/event",{method:"POST",body:JSON.stringify({ eventType, ...payload })}),
  summary:()=>req("/analytics/summary"),
};
export const places = {
  list:(workSlug="")=>req(`/places${workSlug ? `?work=${encodeURIComponent(workSlug)}` : ""}`),
  get:(slug, workSlug="")=>req(`/places/${encodeURIComponent(slug)}${workSlug ? `?work=${encodeURIComponent(workSlug)}` : ""}`),
  update:(slug, data)=>req(`/places/${encodeURIComponent(slug)}`,{method:"PUT",body:JSON.stringify(data)}),
  uploadImage:(fileName,mimeType,dataUrl)=>req("/places/upload-image",{method:"POST",body:JSON.stringify({fileName,mimeType,dataUrl})}),
};
export const notifications = {
  list:()=>req("/notifications"),
  markRead:id=>req(`/notifications/${id}/read`,{method:"POST"}),
  markAllRead:()=>req("/notifications/read-all",{method:"POST"}),
};
export const layers = {
  list:()=>req("/layers"),
  get:id=>req(`/layers/${id}`),
  create:(name,description)=>req("/layers",{method:"POST",body:JSON.stringify({name,description})}),
  update:(id,d)=>req(`/layers/${id}`,{method:"PUT",body:JSON.stringify(d)}),
  delete:id=>req(`/layers/${id}`,{method:"DELETE"}),
  subscribe:id=>req(`/layers/${id}/subscribe`,{method:"POST"}),
  unsubscribe:id=>req(`/layers/${id}/subscribe`,{method:"DELETE"}),
  addAnnotation:(id,annotationId)=>req(`/layers/${id}/add-annotation`,{method:"POST",body:JSON.stringify({annotationId})}),
  removeAnnotation:(id,annotationId)=>req(`/layers/${id}/remove-annotation`,{method:"POST",body:JSON.stringify({annotationId})}),
};
export const progress = {
  myAll:()=>req("/progress"),
  update:(slug,d)=>req(`/progress/${slug}`,{method:"POST",body:JSON.stringify(d)}),
};
export const words = {
  lookup:w=>req(`/words/${encodeURIComponent(w)}`),
  autocomplete:prefix=>req(`/words?prefix=${encodeURIComponent(prefix)}`),
};
