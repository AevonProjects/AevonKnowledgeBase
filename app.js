(() => {
  const cfg = window.AEVON_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR_PROJECT") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = { session:null, profile:null, articles:[], categories:[], tags:[], current:null, editing:null, category:"", tag:"", query:"" };
  const emojis = ["😊","👍","💡","⚠️","📖","🛠️","🎮","💰","⚔️","🏆","🧩","🆕","🤝","☁️","✨","❤️","✅","❌","📌","🔎","🚀","🎉"];

  function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); }
  function escapeHtml(s=""){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
  function slugify(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||crypto.randomUUID();}
  function dateFmt(v){return v?new Date(v).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"";}
  function discordMeta(){ const u=state.session?.user; const m=u?.user_metadata||{}; return {name:m.full_name||m.name||m.user_name||m.preferred_username||"Discord user",avatar:m.avatar_url||m.picture||""};}
  function isAdmin(){return state.profile?.role==="admin";}

  async function boot(){
    if(!configured){
      $("#articleGrid").innerHTML='<div class="empty">Setup required: open <b>config.js</b> and add your Supabase URL and publishable/anon key, then run <b>supabase-setup.sql</b>.</div>';
      $("#pinnedSection").classList.add("hidden");
      renderUser();
      return;
    }
    const {data:{session}}=await sb.auth.getSession(); state.session=session;
    if(session) await loadProfile();
    sb.auth.onAuthStateChange(async(_,session)=>{state.session=session; state.profile=null;if(session) await loadProfile();renderUser();});
    await Promise.all([loadCategories(),loadTags(),loadArticles()]);
    renderAll(); renderUser();
    const hash=location.hash.slice(1);
    if(hash.startsWith("article/")) openArticle(hash.split("/")[1],false);
  }

  async function loadProfile(){
    const {data}=await sb.from("profiles").select("*").eq("id",state.session.user.id).maybeSingle();
    state.profile=data;
  }
  async function loadCategories(){const {data,error}=await sb.from("categories").select("*").order("sort_order").order("name");if(!error)state.categories=data||[];}
  async function loadTags(){const {data,error}=await sb.from("tags").select("*").order("name");if(!error)state.tags=data||[];}
  async function loadArticles(){
    let q=sb.from("articles").select("*, categories(name), article_tags(tags(id,name,emoji))").eq("status","published").order("pinned",{ascending:false}).order("published_at",{ascending:false});
    const {data,error}=await q;if(!error)state.articles=data||[];
  }

  function renderUser(){
    const box=$("#userBox"), admin=$("#adminBtn");
    admin.classList.toggle("hidden",!isAdmin());
    if(!state.session){
      box.innerHTML='<button class="primary" id="discordLogin">Continue with Discord</button>';
      $("#discordLogin").onclick=login;
    } else {
      const m=discordMeta();
      box.innerHTML=`<div class="user-chip">${m.avatar?`<img class="avatar" src="${escapeHtml(m.avatar)}" alt="">`:""}<span class="user-name">${escapeHtml(m.name)}</span><button class="ghost" id="logoutBtn">Sign out</button></div>`;
      $("#logoutBtn").onclick=()=>sb.auth.signOut();
    }
  }
  async function login(){
    const {error}=await sb.auth.signInWithOAuth({provider:"discord",options:{redirectTo:location.origin+location.pathname}});
    if(error) toast(error.message);
  }

  function renderAll(){renderCategories();renderTags();renderArticles();renderCommonSearches();}
  function renderCategories(){
    $("#categoryList").innerHTML=state.categories.map(c=>`<button class="category" data-category="${c.id}">${escapeHtml(c.icon||"📁")} ${escapeHtml(c.name)}</button>`).join("");
    $$(".category").forEach(b=>b.onclick=()=>{state.category=b.dataset.category;state.tag="";$$(".category").forEach(x=>x.classList.toggle("active",x===b));renderArticles();});
  }
  function renderTags(){
    $("#tagList").innerHTML=state.tags.map(t=>`<button data-tag="${t.id}">${escapeHtml(t.emoji||"🏷️")} ${escapeHtml(t.name)}</button>`).join("");
    $$("#tagList button").forEach(b=>b.onclick=()=>{state.tag=b.dataset.tag;state.category="";$$(".category").forEach(x=>x.classList.remove("active"));renderArticles();});
  }
  function articleTags(a){return (a.article_tags||[]).map(x=>x.tags).filter(Boolean);}
  function articleCard(a){
    const tags=articleTags(a).slice(0,2).map(t=>`<span class="tag">${escapeHtml(t.emoji||"🏷️")} ${escapeHtml(t.name)}</span>`).join("");
    return `<article class="article-card" data-article="${a.slug}"><div class="tag-row">${tags}</div><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.excerpt||"")}</p><div class="meta">${escapeHtml(a.categories?.name||"General")} · ${dateFmt(a.published_at||a.created_at)}</div></article>`;
  }
  function filtered(){
    const q=state.query.toLowerCase().trim();
    return state.articles.filter(a=>{
      const categoryOk=!state.category||a.category_id===state.category;
      const tagOk=!state.tag||articleTags(a).some(t=>t.id===state.tag);
      const hay=[a.title,a.excerpt,a.keywords,(a.categories?.name||""),articleTags(a).map(t=>t.name).join(" ")].join(" ").toLowerCase();
      return categoryOk&&tagOk&&(!q||hay.includes(q));
    });
  }
  function renderArticles(){
    const list=filtered(), pinned=state.articles.filter(a=>a.pinned).slice(0,4);
    $("#articleGrid").innerHTML=list.map(articleCard).join("");
    $("#pinnedGrid").innerHTML=pinned.map(articleCard).join("");
    $("#pinnedSection").classList.toggle("hidden",pinned.length===0||!!state.query||!!state.category||!!state.tag);
    $("#emptyState").classList.toggle("hidden",list.length>0);
    $("#resultCount").textContent=`${list.length} article${list.length===1?"":"s"}`;
    $("#articleHeading").textContent=state.query?`Results for “${state.query}”`:state.tag?"Tagged articles":state.category?"Category articles":"Latest articles";
    $$("[data-article]").forEach(el=>el.onclick=()=>openArticle(el.dataset.article));
  }
  async function renderCommonSearches(){
    if(!sb)return;
    const {data}=await sb.from("popular_searches").select("*").limit(5);
    $("#commonSearches").innerHTML=(data||[]).map(x=>`<button data-q="${escapeHtml(x.term)}">${escapeHtml(x.term)}</button>`).join("");
    $$("#commonSearches button").forEach(b=>b.onclick=()=>{$("#searchInput").value=b.dataset.q;state.query=b.dataset.q;renderArticles();});
  }
  let searchTimer;
  $("#searchInput").addEventListener("input",e=>{state.query=e.target.value;renderArticles();clearTimeout(searchTimer);if(state.query.trim().length>=2)searchTimer=setTimeout(()=>logSearch(state.query.trim()),900);});
  async function logSearch(term){if(sb)await sb.rpc("record_search",{p_term:term});}
  document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){e.preventDefault();$("#searchInput").focus();}});

  async function openArticle(slug,push=true){
    if(!sb)return;
    const {data:a,error}=await sb.from("articles").select("*, categories(name), article_tags(tags(id,name,emoji))").eq("slug",slug).eq("status","published").single();
    if(error){toast("Article not found.");return}
    state.current=a; show("articleView"); if(push)history.pushState({article:slug},"","#article/"+slug);
    $("#articleTitle").textContent=a.title;
    $("#articleTags").innerHTML=articleTags(a).map(t=>`<span class="tag">${escapeHtml(t.emoji||"🏷️")} ${escapeHtml(t.name)}</span>`).join("");
    $("#articleMeta").textContent=`${a.categories?.name||"General"} · Updated ${dateFmt(a.updated_at)}`;
    $("#articleBody").innerHTML=DOMPurify.sanitize(a.content_html||"");
    await sb.rpc("record_article_view",{p_article_id:a.id});
    await renderLike(); await renderComments();
    scrollTo({top:0,behavior:"smooth"});
  }
  async function renderLike(){
    const a=state.current; const {count}=await sb.from("article_likes").select("*",{count:"exact",head:true}).eq("article_id",a.id);
    $("#likeCount").textContent=count||0; let liked=false;
    if(state.session){const {data}=await sb.from("article_likes").select("article_id").eq("article_id",a.id).eq("user_id",state.session.user.id).maybeSingle();liked=!!data;}
    $("#likeBtn").classList.toggle("liked",liked);$("#likeBtn").firstChild.textContent=liked?"♥ ":"♡ ";
    $("#likeBtn").onclick=async()=>{if(!state.session){toast("Sign in with Discord to like articles.");return}if(liked)await sb.from("article_likes").delete().eq("article_id",a.id).eq("user_id",state.session.user.id);else await sb.from("article_likes").insert({article_id:a.id,user_id:state.session.user.id});renderLike();};
  }
  async function renderComments(){
    const a=state.current;
    const {data}=await sb.from("comments").select("*, profiles(display_name,avatar_url)").eq("article_id",a.id).eq("is_hidden",false).order("created_at",{ascending:false});
    const comments=data||[];$("#commentCount").textContent=`${comments.length} comment${comments.length===1?"":"s"}`;
    $("#commentList").innerHTML=comments.map(c=>`<div class="comment"><div class="comment-user">${c.profiles?.avatar_url?`<img src="${escapeHtml(c.profiles.avatar_url)}" alt="">`:""}<span>${escapeHtml(c.profiles?.display_name||"Discord user")}</span><small>${dateFmt(c.created_at)}</small></div><p>${escapeHtml(c.body)}</p></div>`).join("");
    if(!a.allow_comments){$("#commentComposer").innerHTML='<div class="login-note">Comments are disabled for this article.</div>';return}
    if(!state.session){$("#commentComposer").innerHTML='<div class="login-note"><span>Sign in with Discord to join the discussion.</span><button class="primary" id="commentLogin">Continue with Discord</button></div>';$("#commentLogin").onclick=login;return}
    $("#commentComposer").innerHTML='<div class="comment-composer"><textarea id="commentText" maxlength="800" placeholder="Write a helpful comment…"></textarea><div class="composer-foot"><span>Maximum 3 comments per article every 24 hours · 800 characters</span><button class="primary" id="postComment">Post comment</button></div></div>';
    $("#postComment").onclick=postComment;
  }
  async function postComment(){
    const body=$("#commentText").value.trim();if(!body)return;
    const {error}=await sb.from("comments").insert({article_id:state.current.id,user_id:state.session.user.id,body});
    if(error){toast(error.message.includes("COMMENT_LIMIT")?"You reached the 3-comment limit for this article today.":error.message);return}
    $("#commentText").value="";toast("Comment posted.");renderComments();
  }

  function show(id){["homeView","articleView","adminView","editorView"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id));}
  $$("[data-route=home]").forEach(b=>b.onclick=()=>{show("homeView");history.pushState({},"",location.pathname);scrollTo(0,0)});
  $("#adminBtn").onclick=()=>openAdmin();
  async function openAdmin(){
    if(!isAdmin()){toast("Admin access required.");return}
    show("adminView");await renderAdminArticles();scrollTo(0,0);
  }
  async function renderAdminArticles(){
    const {data}=await sb.from("articles").select("id,title,status,updated_at,pinned").order("updated_at",{ascending:false});
    $("#adminArticleList").innerHTML=(data||[]).map(a=>`<div class="admin-item"><div><b>${a.pinned?"📌 ":""}${escapeHtml(a.title)}</b><br><small>${escapeHtml(a.status)} · ${dateFmt(a.updated_at)}</small></div><div class="admin-actions"><button class="ghost edit-article" data-id="${a.id}">Edit</button><button class="ghost danger delete-article" data-id="${a.id}">Delete</button></div></div>`).join("");
    $$(".edit-article").forEach(b=>b.onclick=()=>openEditor(b.dataset.id));$$(".delete-article").forEach(b=>b.onclick=()=>deleteArticle(b.dataset.id));
  }
  $("#newArticleBtn").onclick=()=>openEditor();
  async function deleteArticle(id){if(!confirm("Delete this article permanently?"))return;const {error}=await sb.from("articles").delete().eq("id",id);if(error)toast(error.message);else{toast("Article deleted.");renderAdminArticles();loadArticles();}}
  $$(".admin-tab").forEach(b=>b.onclick=async()=>{$$(".admin-tab").forEach(x=>x.classList.toggle("active",x===b));["Articles","Categories","Tags","Comments"].forEach(x=>$("#admin"+x).classList.add("hidden"));$("#admin"+b.dataset.adminTab[0].toUpperCase()+b.dataset.adminTab.slice(1)).classList.remove("hidden");if(b.dataset.adminTab==="categories")renderAdminCategories();if(b.dataset.adminTab==="tags")renderAdminTags();if(b.dataset.adminTab==="comments")renderAdminComments();});
  async function renderAdminCategories(){
    $("#adminCategories").innerHTML=`<div class="panel-head"><h2>Categories</h2></div><form id="catForm" class="simple-form"><input id="catIcon" placeholder="Emoji" maxlength="4"><input id="catName" placeholder="Category name" required><button class="primary">Add</button></form><div>${state.categories.map(c=>`<div class="admin-item"><span>${escapeHtml(c.icon||"📁")} ${escapeHtml(c.name)}</span><button class="ghost danger del-cat" data-id="${c.id}">Delete</button></div>`).join("")}</div>`;
    $("#catForm").onsubmit=async e=>{e.preventDefault();const {error}=await sb.from("categories").insert({name:$("#catName").value.trim(),icon:$("#catIcon").value.trim()||"📁",slug:slugify($("#catName").value)});if(error)toast(error.message);else{await loadCategories();renderAdminCategories();renderCategories();}};
    $$(".del-cat").forEach(b=>b.onclick=async()=>{if(confirm("Delete this category? Articles will become uncategorized.")){await sb.from("categories").delete().eq("id",b.dataset.id);await loadCategories();renderAdminCategories();renderCategories();}});
  }
  async function renderAdminTags(){
    $("#adminTags").innerHTML=`<div class="panel-head"><h2>Tags</h2></div><form id="tagForm" class="simple-form"><input id="tagEmoji" placeholder="Emoji" maxlength="4"><input id="tagName" placeholder="Tag name" required><button class="primary">Add</button></form><div>${state.tags.map(t=>`<div class="admin-item"><span>${escapeHtml(t.emoji||"🏷️")} ${escapeHtml(t.name)}</span><button class="ghost danger del-tag" data-id="${t.id}">Delete</button></div>`).join("")}</div>`;
    $("#tagForm").onsubmit=async e=>{e.preventDefault();const {error}=await sb.from("tags").insert({name:$("#tagName").value.trim(),emoji:$("#tagEmoji").value.trim()||"🏷️",slug:slugify($("#tagName").value)});if(error)toast(error.message);else{await loadTags();renderAdminTags();renderTags();}};
    $$(".del-tag").forEach(b=>b.onclick=async()=>{if(confirm("Delete this tag?")){await sb.from("tags").delete().eq("id",b.dataset.id);await loadTags();renderAdminTags();renderTags();}});
  }
  async function renderAdminComments(){
    const {data}=await sb.from("comments").select("id,body,created_at,is_hidden,profiles(display_name),articles(title)").order("created_at",{ascending:false}).limit(100);
    $("#adminComments").innerHTML=`<div class="panel-head"><h2>Recent comments</h2></div>${(data||[]).map(c=>`<div class="admin-item"><div><b>${escapeHtml(c.profiles?.display_name||"User")}</b> on ${escapeHtml(c.articles?.title||"article")}<br><small>${escapeHtml(c.body)}</small></div><div class="admin-actions"><button class="ghost toggle-comment" data-id="${c.id}" data-hidden="${c.is_hidden}">${c.is_hidden?"Show":"Hide"}</button><button class="ghost danger delete-comment" data-id="${c.id}">Delete</button></div></div>`).join("")}`;
    $$(".toggle-comment").forEach(b=>b.onclick=async()=>{await sb.from("comments").update({is_hidden:b.dataset.hidden!=="true"}).eq("id",b.dataset.id);renderAdminComments();});
    $$(".delete-comment").forEach(b=>b.onclick=async()=>{if(confirm("Delete this comment?")){await sb.from("comments").delete().eq("id",b.dataset.id);renderAdminComments();}});
  }

  async function openEditor(id=null){
    if(!isAdmin())return; state.editing=null; show("editorView");
    $("#editCategory").innerHTML='<option value="">No category</option>'+state.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.icon||"")} ${escapeHtml(c.name)}</option>`).join("");
    $("#editTags").innerHTML=state.tags.map(t=>`<label><input type="checkbox" value="${t.id}">${escapeHtml(t.emoji||"🏷️")} ${escapeHtml(t.name)}</label>`).join("");
    $("#editTitle").value="";$("#editExcerpt").value="";$("#editor").innerHTML="";$("#editKeywords").value="";$("#editPinned").checked=false;$("#editFeatured").checked=false;$("#editComments").checked=true;$("#editCategory").value="";
    if(id){
      const {data:a}=await sb.from("articles").select("*,article_tags(tag_id)").eq("id",id).single();state.editing=a;
      $("#editTitle").value=a.title;$("#editExcerpt").value=a.excerpt||"";$("#editor").innerHTML=DOMPurify.sanitize(a.content_html||"");$("#editKeywords").value=a.keywords||"";$("#editPinned").checked=a.pinned;$("#editFeatured").checked=a.featured;$("#editComments").checked=a.allow_comments;$("#editCategory").value=a.category_id||"";
      const ids=(a.article_tags||[]).map(x=>x.tag_id);$$('#editTags input').forEach(x=>x.checked=ids.includes(x.value));$("#editorStatus").textContent=`Editing · ${a.status}`;
    } else $("#editorStatus").textContent="New article";
    scrollTo(0,0);
  }
  $("#cancelEditor").onclick=openAdmin;
  $$("#toolbar [data-cmd]").forEach(b=>b.onclick=()=>{document.execCommand(b.dataset.cmd,false,null);$("#editor").focus();});
  $("#formatBlock").onchange=e=>document.execCommand("formatBlock",false,e.target.value);
  $("#fontSize").onchange=e=>document.execCommand("fontSize",false,e.target.value);
  $("#linkBtn").onclick=()=>{const url=prompt("Link URL (https://…)");if(url&&/^https?:\/\//i.test(url))document.execCommand("createLink",false,url);};
  $("#emojiBtn").onclick=()=>{$("#emojiPicker").classList.toggle("hidden");};
  $("#emojiPicker").innerHTML=emojis.map(e=>`<button>${e}</button>`).join("");
  $$("#emojiPicker button").forEach(b=>b.onclick=()=>{document.execCommand("insertText",false,b.textContent);$("#emojiPicker").classList.add("hidden");$("#editor").focus();});
  $("#imageBtn").onclick=()=>$("#imageInput").click();
  $("#imageInput").onchange=async e=>{
    const f=e.target.files[0];if(!f)return;if(f.size>5*1024*1024){toast("Image must be 5 MB or smaller.");return}
    const ext=(f.name.split(".").pop()||"png").toLowerCase();const path=`articles/${state.session.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    toast("Uploading image…");const {error}=await sb.storage.from("article-images").upload(path,f,{cacheControl:"3600",upsert:false,contentType:f.type});if(error){toast(error.message);return}
    const {data}=sb.storage.from("article-images").getPublicUrl(path);document.execCommand("insertHTML",false,`<img src="${data.publicUrl}" alt="Article image">`);toast("Image inserted.");e.target.value="";
  };
  $("#saveDraftBtn").onclick=()=>saveArticle("draft");$("#publishBtn").onclick=()=>saveArticle("published");
  async function saveArticle(status){
    const title=$("#editTitle").value.trim(),content=DOMPurify.sanitize($("#editor").innerHTML,{ADD_ATTR:["style"]});if(!title||!content.trim()){toast("Add a title and article content first.");return}
    const payload={title,slug:state.editing?.slug||slugify(title)+"-"+Math.random().toString(36).slice(2,7),excerpt:$("#editExcerpt").value.trim(),content_html:content,keywords:$("#editKeywords").value.trim(),category_id:$("#editCategory").value||null,pinned:$("#editPinned").checked,featured:$("#editFeatured").checked,allow_comments:$("#editComments").checked,status,published_at:status==="published"?(state.editing?.published_at||new Date().toISOString()):state.editing?.published_at||null,author_id:state.session.user.id};
    let res;if(state.editing)res=await sb.from("articles").update(payload).eq("id",state.editing.id).select().single();else res=await sb.from("articles").insert(payload).select().single();
    if(res.error){toast(res.error.message);return}
    const articleId=res.data.id;await sb.from("article_tags").delete().eq("article_id",articleId);const selected=$$("#editTags input:checked").map(x=>({article_id:articleId,tag_id:x.value}));if(selected.length)await sb.from("article_tags").insert(selected);
    toast(status==="published"?"Article published.":"Draft saved.");await loadArticles();await renderAdminArticles();openAdmin();
  }

  window.addEventListener("popstate",()=>{const hash=location.hash.slice(1);if(hash.startsWith("article/"))openArticle(hash.split("/")[1],false);else show("homeView");});
  boot();
})();