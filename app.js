(() => {
  const cfg = window.AEVON_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR_PROJECT") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = { session:null, profile:null, articles:[], categories:[], tags:[], current:null, editing:null, category:"", tag:"", query:"", news:[], dailyPosts:[], tickets:[] };
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
    await Promise.all([loadCategories(),loadTags(),loadArticles(),loadPortalData()]);
    renderAll(); renderUser(); renderPortalHome(); await refreshTicketBadge();
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

  function show(id){["portalHomeView","homeView","articleView","dailyView","ticketsView","adminView","editorView"].forEach(x=>$("#"+x).classList.toggle("hidden",x!==id)); $$(".nav-link").forEach(n=>n.classList.toggle("active",(id==="portalHomeView"&&n.dataset.route==="portal")||(id==="homeView"&&n.dataset.route==="kb")||(id==="dailyView"&&n.dataset.route==="daily")||(id==="ticketsView"&&n.dataset.route==="tickets")));}
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
  $$(".admin-tab").forEach(b=>b.onclick=async()=>{$$(".admin-tab").forEach(x=>x.classList.toggle("active",x===b));["Articles","News","Posts","Tickets","Categories","Tags","Comments"].forEach(x=>$("#admin"+x)?.classList.add("hidden"));const panel=$("#admin"+b.dataset.adminTab[0].toUpperCase()+b.dataset.adminTab.slice(1));if(panel)panel.classList.remove("hidden");if(b.dataset.adminTab==="categories")renderAdminCategories();if(b.dataset.adminTab==="tags")renderAdminTags();if(b.dataset.adminTab==="comments")renderAdminComments();if(b.dataset.adminTab==="news")renderAdminNews();if(b.dataset.adminTab==="posts")renderAdminPosts();if(b.dataset.adminTab==="tickets")renderAdminTickets();});
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



  async function loadPortalData(){
    if(!sb)return;
    const [{data:n},{data:p}]=await Promise.all([
      sb.from("news_posts").select("*,profiles:author_id(display_name,avatar_url)").eq("published",true).order("pinned",{ascending:false}).order("created_at",{ascending:false}).limit(20),
      sb.from("daily_posts").select("*,profiles:user_id(display_name,avatar_url),daily_post_likes(user_id),daily_post_comments(id,body,user_id,created_at,profiles:user_id(display_name))").eq("is_hidden",false).order("created_at",{ascending:false}).limit(50)
    ]); state.news=n||[];state.dailyPosts=p||[];
  }
  function renderPortalHome(){
    $("#newsFeed").innerHTML=state.news.length?state.news.slice(0,6).map(n=>`<article class="news-card card"><span class="mini">${n.pinned?"📌 PINNED":"UPDATE"}</span><h3>${escapeHtml(n.title)}</h3><p>${escapeHtml(n.body)}</p><div class="meta">${dateFmt(n.created_at)}</div></article>`).join(""):'<div class="card news-card"><p>No news has been posted yet.</p></div>';
    $("#homeDailyPosts").innerHTML=state.dailyPosts.slice(0,4).map(p=>`<div class="mini-comment"><b>${escapeHtml(p.profiles?.display_name||"User")}</b><br>${escapeHtml(p.title)}</div>`).join("")||'<p class="count">No community posts yet.</p>';
    const st=cfg.SERVER_STATUS_URL; if(st)fetch(st).then(r=>r.json()).then(d=>{const online=d.online??d.status==="online"??false;$("#serverStatusText").textContent=online?"Online":"Offline";$(".status-dot").classList.toggle("online",!!online);$("#onlineCount").textContent=d.players?.online??d.onlinePlayers??"—"}).catch(()=>$("#serverStatusText").textContent="Unavailable"); else $("#serverStatusText").textContent="Status endpoint not configured";
  }
  async function renderDailyPosts(){
    await loadPortalData(); const used=state.session?state.dailyPosts.filter(p=>p.user_id===state.session.user.id).length:0, allowance=state.profile?.post_allowance??1;
    $("#postAllowance").innerHTML=state.session?`You have used <b>${used}</b> of <b>${allowance}</b> post permission${allowance===1?"":"s"}. ${used>=allowance?'Need another? <button class="ghost" id="requestMore">Submit a ticket</button>':''}`:'Sign in with Discord to create, like, or comment on posts.';
    if($("#requestMore"))$("#requestMore").onclick=()=>openTickets(true);
    $("#createPostBtn").disabled=!state.session||used>=allowance;
    $("#dailyFeed").innerHTML=state.dailyPosts.map(p=>{const liked=state.session&&(p.daily_post_likes||[]).some(l=>l.user_id===state.session.user.id);return `<article class="post-card card"><div class="post-meta">${p.profiles?.avatar_url?`<img src="${escapeHtml(p.profiles.avatar_url)}">`:''}<b>${escapeHtml(p.profiles?.display_name||"Discord user")}</b><span>${dateFmt(p.created_at)}</span></div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.body)}</p><div class="post-actions"><button class="ghost post-like" data-id="${p.id}" data-liked="${liked}">${liked?'♥':'♡'} ${(p.daily_post_likes||[]).length}</button><button class="ghost post-comment-toggle" data-id="${p.id}">💬 ${(p.daily_post_comments||[]).length}</button></div><div class="post-comments hidden" id="pc-${p.id}">${(p.daily_post_comments||[]).map(c=>`<div class="mini-comment"><b>${escapeHtml(c.profiles?.display_name||"User")}</b> ${escapeHtml(c.body)}</div>`).join("")}<div class="simple-form"><input class="post-comment-input" data-id="${p.id}" maxlength="800" placeholder="Write a comment…"><button class="primary post-comment-send" data-id="${p.id}">Post</button></div></div></article>`}).join("")||'<div class="empty">No Daily Posts yet.</div>';
    $$(".post-like").forEach(b=>b.onclick=()=>togglePostLike(b.dataset.id,b.dataset.liked==="true"));$$(".post-comment-toggle").forEach(b=>b.onclick=()=>$("#pc-"+b.dataset.id).classList.toggle("hidden"));$$(".post-comment-send").forEach(b=>b.onclick=()=>postDailyComment(b.dataset.id));
  }
  async function togglePostLike(id,liked){if(!state.session)return login();if(liked)await sb.from("daily_post_likes").delete().eq("post_id",id).eq("user_id",state.session.user.id);else await sb.from("daily_post_likes").insert({post_id:id,user_id:state.session.user.id});renderDailyPosts()}
  async function postDailyComment(id){if(!state.session)return login();const input=$(`.post-comment-input[data-id="${id}"]`),body=input.value.trim();if(!body)return;const {error}=await sb.from("daily_post_comments").insert({post_id:id,user_id:state.session.user.id,body});if(error)toast(error.message);else renderDailyPosts()}
  $("#createPostBtn").onclick=()=>{if(!state.session)return login();$("#postComposer").classList.remove("hidden")};$("#cancelPost").onclick=()=>$("#postComposer").classList.add("hidden");$("#submitPost").onclick=async()=>{const title=$("#postTitle").value.trim(),body=$("#postBody").value.trim();if(!title||!body)return toast("Add a title and message.");const {error}=await sb.rpc("create_daily_post",{p_title:title,p_body:body});if(error)return toast(error.message.includes("POST_LIMIT")?"You have used your post allowance. Submit a ticket for more.":error.message);$("#postTitle").value="";$("#postBody").value="";$("#postComposer").classList.add("hidden");toast("Post published.");await loadProfile();renderDailyPosts();renderPortalHome()};

  async function refreshTicketBadge(){if(!state.session)return;const {data}=await sb.from("tickets").select("id,user_last_read_at,ticket_messages(created_at,is_admin_reply)").eq("user_id",state.session.user.id).eq("status","open");let unread=0;(data||[]).forEach(t=>{if((t.ticket_messages||[]).some(m=>m.is_admin_reply&&new Date(m.created_at)>new Date(t.user_last_read_at)))unread++});$("#ticketBadge").textContent=unread;$("#ticketBadge").classList.toggle("hidden",unread===0)}
  async function openTickets(prefill=false){show("ticketsView");if(!state.session){$("#ticketList").innerHTML='<div class="login-note"><span>Sign in with Discord to use tickets.</span><button class="primary" id="ticketLogin">Continue with Discord</button></div>';$("#ticketLogin").onclick=login;return}if(prefill){$("#ticketComposer").classList.remove("hidden");$("#ticketType").value="post_permission";$("#ticketSubject").value="Request additional Daily Post permission"}const {data}=await sb.from("tickets").select("*,ticket_messages(id,body,created_at,is_admin_reply,sender_id,profiles:sender_id(display_name,avatar_url))").eq("user_id",state.session.user.id).order("updated_at",{ascending:false});state.tickets=data||[];$("#ticketList").innerHTML=state.tickets.map(t=>{const unread=(t.ticket_messages||[]).some(m=>m.is_admin_reply&&new Date(m.created_at)>new Date(t.user_last_read_at));return `<div class="ticket-card card ${unread?'unread':''}" data-ticket="${t.id}"><div class="head"><b>${escapeHtml(t.subject)}</b><span class="ticket-status">${escapeHtml(t.status)}</span></div><small>${(t.ticket_messages||[]).length} messages · ${dateFmt(t.updated_at)}</small></div>`}).join("")||'<div class="empty">No tickets yet.</div>';$$("[data-ticket]").forEach(x=>x.onclick=()=>openTicketThread(x.dataset.ticket))}
  $("#newTicketBtn").onclick=()=>{if(!state.session)return login();$("#ticketComposer").classList.remove("hidden")};$("#cancelTicket").onclick=()=>$("#ticketComposer").classList.add("hidden");$("#submitTicket").onclick=async()=>{const subject=$("#ticketSubject").value.trim(),body=$("#ticketMessage").value.trim();if(!subject||!body)return toast("Add a subject and message.");const {data:t,error}=await sb.from("tickets").insert({user_id:state.session.user.id,type:$("#ticketType").value,subject}).select().single();if(error)return toast(error.message);await sb.from("ticket_messages").insert({ticket_id:t.id,sender_id:state.session.user.id,body,is_admin_reply:false});$("#ticketComposer").classList.add("hidden");toast("Ticket submitted.");openTickets()};
  async function openTicketThread(id){const t=state.tickets.find(x=>x.id===id);await sb.from("tickets").update({user_last_read_at:new Date().toISOString()}).eq("id",id);$("#ticketList").classList.add("hidden");$("#ticketThread").classList.remove("hidden");$("#ticketThread").innerHTML=`<button class="back" id="ticketBack">← Tickets</button><div class="card post-card"><div class="head"><h2>${escapeHtml(t.subject)}</h2><span class="ticket-status">${t.status}</span></div>${(t.ticket_messages||[]).map(m=>`<div class="thread-message ${m.is_admin_reply?'admin':''}"><b>${m.is_admin_reply?'Admin':escapeHtml(m.profiles?.display_name||'You')}</b><p>${escapeHtml(m.body)}</p></div>`).join("")}<div class="simple-form"><input id="ticketReply" maxlength="3000" placeholder="Reply…"><button class="primary" id="sendTicketReply">Send</button></div></div>`;$("#ticketBack").onclick=()=>{$("#ticketThread").classList.add("hidden");$("#ticketList").classList.remove("hidden");openTickets()};$("#sendTicketReply").onclick=async()=>{const body=$("#ticketReply").value.trim();if(!body)return;await sb.from("ticket_messages").insert({ticket_id:id,sender_id:state.session.user.id,body,is_admin_reply:isAdmin()});await sb.from("tickets").update({updated_at:new Date().toISOString()}).eq("id",id);openTickets()};refreshTicketBadge()}

  async function renderAdminNews(){const {data}=await sb.from("news_posts").select("*").order("created_at",{ascending:false});$("#adminNews").innerHTML=`<div class="panel-head"><h2>News & Updates</h2><button class="primary" id="addNews">+ Add news</button></div>${(data||[]).map(n=>`<div class="admin-item"><div><b>${n.pinned?'📌 ':''}${escapeHtml(n.title)}</b><br><small>${escapeHtml(n.body)}</small></div><button class="ghost danger del-news" data-id="${n.id}">Delete</button></div>`).join("")}`;$("#addNews").onclick=async()=>{const title=prompt("News title");if(!title)return;const body=prompt("News/update message");if(!body)return;await sb.from("news_posts").insert({title,body,author_id:state.session.user.id});renderAdminNews();await loadPortalData();renderPortalHome()};$$(".del-news").forEach(b=>b.onclick=async()=>{if(confirm("Delete this news post?")){await sb.from("news_posts").delete().eq("id",b.dataset.id);renderAdminNews()}})}
  async function renderAdminPosts(){const {data}=await sb.from("daily_posts").select("*,profiles:user_id(display_name)").order("created_at",{ascending:false});$("#adminPosts").innerHTML=`<div class="panel-head"><h2>Daily Posts</h2></div>${(data||[]).map(p=>`<div class="admin-item"><div><b>${escapeHtml(p.title)}</b> · ${escapeHtml(p.profiles?.display_name||'User')}<br><small>${escapeHtml(p.body)}</small></div><div class="admin-actions"><button class="ghost toggle-post" data-id="${p.id}" data-hidden="${p.is_hidden}">${p.is_hidden?'Show':'Hide'}</button><button class="ghost danger del-post" data-id="${p.id}">Delete</button></div></div>`).join("")}`;$$(".toggle-post").forEach(b=>b.onclick=async()=>{await sb.from("daily_posts").update({is_hidden:b.dataset.hidden!=="true"}).eq("id",b.dataset.id);renderAdminPosts()});$$(".del-post").forEach(b=>b.onclick=async()=>{if(confirm("Delete this post?")){await sb.from("daily_posts").delete().eq("id",b.dataset.id);renderAdminPosts()}})}
  async function renderAdminTickets(){const {data}=await sb.from("tickets").select("*,profiles:user_id(display_name,post_allowance),ticket_messages(id,body,created_at,is_admin_reply,sender_id)").order("updated_at",{ascending:false});$("#adminTickets").innerHTML=`<div class="panel-head"><h2>Tickets</h2></div>${(data||[]).map(t=>`<div class="admin-item"><div><b>${escapeHtml(t.subject)}</b> · ${escapeHtml(t.profiles?.display_name||'User')}<br><small>${escapeHtml(t.type)} · ${escapeHtml(t.status)} · ${(t.ticket_messages||[]).length} messages</small></div><div class="admin-actions"><button class="ghost admin-ticket-open" data-id="${t.id}">Open</button>${t.type==='post_permission'?`<span class="grant-row"><input type="number" min="1" value="1" id="grant-${t.id}"><button class="primary grant-posts" data-id="${t.id}" data-user="${t.user_id}" data-current="${t.profiles?.post_allowance||1}">Grant</button></span>`:''}</div></div>`).join("")}`;$$(".grant-posts").forEach(b=>b.onclick=async()=>{const n=Math.max(1,parseInt($("#grant-"+b.dataset.id).value)||1);await sb.from("profiles").update({post_allowance:Number(b.dataset.current)+n}).eq("id",b.dataset.user);await sb.from("ticket_messages").insert({ticket_id:b.dataset.id,sender_id:state.session.user.id,body:`Granted ${n} additional Daily Post permission${n===1?'':'s'}.`,is_admin_reply:true});await sb.from("tickets").update({updated_at:new Date().toISOString()}).eq("id",b.dataset.id);toast("Post permissions granted.");renderAdminTickets()});$$(".admin-ticket-open").forEach(b=>b.onclick=async()=>{const t=(data||[]).find(x=>x.id===b.dataset.id),body=prompt(`Reply to ${t.profiles?.display_name||'user'}:`);if(body){await sb.from("ticket_messages").insert({ticket_id:t.id,sender_id:state.session.user.id,body,is_admin_reply:true});await sb.from("tickets").update({updated_at:new Date().toISOString()}).eq("id",t.id);renderAdminTickets()}})}

  $$('[data-route="portal"]').forEach(b=>b.onclick=()=>{show("portalHomeView");history.pushState({},"",location.pathname);renderPortalHome();scrollTo(0,0)});
  $$('[data-route="kb"]').forEach(b=>b.onclick=()=>{show("homeView");scrollTo(0,0)});
  $$('[data-route="daily"]').forEach(b=>b.onclick=()=>{show("dailyView");renderDailyPosts();scrollTo(0,0)});
  $$('[data-route="tickets"]').forEach(b=>b.onclick=()=>{openTickets();scrollTo(0,0)});

  window.addEventListener("popstate",()=>{const hash=location.hash.slice(1);if(hash.startsWith("article/"))openArticle(hash.split("/")[1],false);else show("homeView");});
  boot();
})();