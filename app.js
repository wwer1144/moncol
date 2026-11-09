(() => {
  "use strict";

  const CFG = window.MONCOL_CONFIG || {};
  const LS_PREFIX = "moncol-progress-v1";
  const SAVE_DELAY = 700;
  const PRIORITY_TAGS = new Set(["제로 던전", "하루 5회", "보스", "퀘 반복", "스토리 OK"]);

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let monsters = { elites: [], bosses: [] };
  let state = emptyState();
  let mode = "local";        // local: Supabase 미설정 · guest: 로그인 안 함(보기 전용) · user: 로그인
  let user = null;
  let sb = null;
  let saveTimer = null;
  let localOnly = false;     // 로그인했지만 저장소 연결 실패 → 이 기기에만 저장 중
  const filter = { cat: "all", undone: false, q: "" };

  // ── helpers ────────────────────────────────────────────────
  function emptyState() { return { done: new Set(), custom: [] }; }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function newId() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function canEdit() { return mode === "local" || mode === "user"; }
  function lsKey(uid) { return uid ? `${LS_PREFIX}:${uid}` : LS_PREFIX; }

  function normalize(j) {
    const done = Array.isArray(j?.done) ? j.done.filter((x) => typeof x === "string") : [];
    const custom = Array.isArray(j?.custom)
      ? j.custom
          .filter((c) => c && typeof c.name === "string" && c.name.trim())
          .map((c) => ({
            id: String(c.id || newId()),
            name: c.name.trim(),
            cat: String(c.cat || "기타"),
            note: String(c.note || ""),
          }))
      : [];
    return { done: new Set(done), custom };
  }
  function serialize() {
    return { exportedAt: new Date().toISOString(), done: [...state.done], custom: state.custom };
  }

  function loadLocal(uid) {
    try {
      const raw = localStorage.getItem(lsKey(uid));
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch { return null; }
  }
  function saveLocal() {
    try { localStorage.setItem(lsKey(user?.id), JSON.stringify(serialize())); } catch {}
  }

  function setStatus(text, kind = "") {
    const el = $("#saveStatus");
    el.textContent = text;
    el.className = "save-status" + (kind ? " " + kind : "");
  }

  // ── remote (Supabase) ──────────────────────────────────────
  async function fetchRemote(uid) {
    const { data, error } = await sb.from("progress").select("done,custom").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function pushRemote() {
    const { error } = await sb.from("progress").upsert({
      user_id: user.id,
      done: [...state.done],
      custom: state.custom,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (mode !== "user") return;
    setStatus("저장 중…");
    try {
      await pushRemote();
      localOnly = false;
      setStatus("저장됨", "ok");
    } catch (e) {
      console.error(e);
      localOnly = true;
      setStatus("저장 실패 — 이 기기에 임시 저장됨", "err");
    }
    renderBanner();
  }

  function scheduleSave() {
    saveLocal();
    if (mode === "local") { setStatus("이 기기에 저장됨", "warn"); return; }
    if (mode !== "user") return;
    setStatus("저장 대기…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY);
  }

  // 탭을 닫거나 숨길 때 대기 중인 저장 바로 실행
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer) flushSave();
  });

  async function applySession(session) {
    const uid = session?.user?.id || null;
    if (uid && mode === "user" && user?.id === uid) return;   // 같은 세션 중복 이벤트 무시
    if (!uid && mode === "guest") return;

    if (saveTimer) await flushSave();

    if (uid) {
      user = session.user;
      mode = "user";
      setStatus("불러오는 중…");
      try {
        const row = await fetchRemote(uid);
        if (row) {
          state = normalize(row);
          localOnly = false;
          saveLocal();
          setStatus("동기화됨", "ok");
        } else {
          // 첫 로그인: 이 기기에 있던 기록이 있으면 올려줌
          const l = loadLocal(uid) || loadLocal(null);
          state = l || emptyState();
          localOnly = false;
          if (l && (l.done.size || l.custom.length)) scheduleSave();
          else setStatus("새 기록", "ok");
        }
      } catch (e) {
        console.error(e);
        localOnly = true;
        state = loadLocal(uid) || emptyState();
        setStatus("저장소 연결 실패 — 이 기기 기록 사용", "err");
      }
    } else {
      user = null;
      mode = "guest";
      localOnly = false;
      state = emptyState();
      setStatus("");
      if (CFG.PUBLIC_VIEW && CFG.OWNER_USER_ID) {
        try {
          const row = await fetchRemote(CFG.OWNER_USER_ID);
          if (row) state = normalize(row);
        } catch (e) { console.error(e); }
      }
    }
    render();
  }

  // ── rendering ──────────────────────────────────────────────
  function matches(text) {
    if (!filter.q) return true;
    return text.toLowerCase().includes(filter.q);
  }
  function visible(id, searchText) {
    if (filter.undone && state.done.has(id)) return false;
    return matches(searchText);
  }

  function cardHTML({ id, name, sub, badges = [], note, prio, deletable }) {
    const done = state.done.has(id);
    const cls = ["card", done && "done", prio && "prio", !canEdit() && "readonly"].filter(Boolean).join(" ");
    const badgeHTML = badges
      .filter((b) => b.text)
      .map((b) => `<span class="badge${b.hot ? " hot" : ""}">${esc(b.text)}</span>`)
      .join("");
    const meta = badgeHTML || note
      ? `<div class="meta">${badgeHTML}${note ? `<span class="note">${esc(note)}</span>` : ""}</div>`
      : "";
    return `<div class="${cls}" data-id="${esc(id)}" role="button" tabindex="0" aria-pressed="${done}">
      <div class="name">${esc(name)}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
      ${meta}
      ${deletable && canEdit() ? `<button class="del" data-del="${esc(id)}" aria-label="삭제" title="삭제">×</button>` : ""}
      <span class="stamp">등록</span>
    </div>`;
  }

  function countDone(ids) { return ids.reduce((n, id) => n + (state.done.has(id) ? 1 : 0), 0); }

  function render() {
    const eliteIds = monsters.elites.map((m) => m.id);
    const bossIds = monsters.bosses.map((m) => m.id);
    const customIds = state.custom.map((c) => c.id);
    const all = [...eliteIds, ...bossIds, ...customIds];
    const doneN = countDone(all);
    const pct = all.length ? Math.round((doneN / all.length) * 1000) / 10 : 0;

    $("#doneCount").textContent = doneN;
    $("#totalCount").textContent = all.length;
    $("#pct").textContent = pct + "%";
    $("#barFill").style.width = pct + "%";
    $(".bar").setAttribute("aria-valuenow", String(pct));

    $("#cnt-elite").textContent = `${countDone(eliteIds)} / ${eliteIds.length}`;
    $("#cnt-boss").textContent = `${countDone(bossIds)} / ${bossIds.length}`;
    $("#cnt-custom").textContent = `${countDone(customIds)} / ${customIds.length}`;

    let shown = 0;

    // elites
    const eliteCards = monsters.elites
      .filter((m) => visible(m.id, `${m.name} ${m.map}`))
      .map((m) => cardHTML({ id: m.id, name: m.name, sub: m.map }));
    $("#grid-elite").innerHTML = eliteCards.join("");
    const showElite = (filter.cat === "all" || filter.cat === "elite") && eliteCards.length > 0;
    $("#sec-elite").hidden = !showElite;
    if (showElite) shown += eliteCards.length;

    // bosses grouped by region (원본 순서 유지)
    const regions = new Map();
    for (const m of monsters.bosses) {
      if (!visible(m.id, `${m.name} ${m.region} ${m.tag} ${m.note}`)) continue;
      if (!regions.has(m.region)) regions.set(m.region, []);
      regions.get(m.region).push(m);
    }
    let bossHTML = "";
    let bossShown = 0;
    for (const [region, list] of regions) {
      const allInRegion = monsters.bosses.filter((b) => b.region === region).map((b) => b.id);
      bossHTML += `<div class="region">${esc(region)} <span class="cnt">${countDone(allInRegion)} / ${allInRegion.length}</span></div>`;
      bossHTML += `<div class="grid">${list
        .map((m) => cardHTML({
          id: m.id,
          name: m.name,
          badges: [{ text: m.tag, hot: PRIORITY_TAGS.has(m.tag) }],
          note: m.note,
          prio: PRIORITY_TAGS.has(m.tag),
        }))
        .join("")}</div>`;
      bossShown += list.length;
    }
    $("#grid-boss").innerHTML = bossHTML;
    const showBoss = (filter.cat === "all" || filter.cat === "boss") && bossShown > 0;
    $("#sec-boss").hidden = !showBoss;
    if (showBoss) shown += bossShown;

    // custom
    const customCards = state.custom
      .filter((c) => visible(c.id, `${c.name} ${c.cat} ${c.note}`))
      .map((c) => cardHTML({ id: c.id, name: c.name, badges: [{ text: c.cat }], note: c.note, deletable: true }));
    $("#grid-custom").innerHTML = customCards.join("");
    $("#customForm").hidden = !canEdit();
    const showCustom =
      filter.cat === "custom" ||
      (filter.cat === "all" && (customCards.length > 0 || (canEdit() && !filter.q && !filter.undone)));
    $("#sec-custom").hidden = !showCustom;
    if (showCustom) shown += customCards.length + (canEdit() ? 1 : 0);

    $("#empty").hidden = shown > 0;
    $("#btnImport").hidden = !canEdit();

    renderAuth();
    renderBanner();
  }

  function renderBanner() {
    const b = $("#banner");
    let msg = "";
    if (mode === "local") msg = "이 기기에만 저장됨 — 저장소(Supabase)가 아직 연결되지 않았어요.";
    else if (mode === "user" && localOnly) msg = "이 기기에만 저장됨 — 저장소 연결에 실패했어요. 다음 체크 때 다시 시도합니다.";
    else if (mode === "guest")
      msg = CFG.PUBLIC_VIEW && CFG.OWNER_USER_ID
        ? "보기 전용 — 로그인하면 체크할 수 있어요."
        : "로그인하면 체크 기록을 보고 수정할 수 있어요.";
    b.textContent = msg;
    b.hidden = !msg;
  }

  function renderAuth() {
    const a = $("#authArea");
    const foot = $("#foot");
    if (!sb) { a.innerHTML = ""; foot.textContent = ""; return; }
    if (mode === "user") {
      a.innerHTML = `<span class="who" title="${esc(user.email)}">${esc(user.email)}</span><button id="btnLogout">로그아웃</button>`;
      foot.textContent = `내 사용자 ID: ${user.id}`;
    } else if (!a.querySelector("#loginForm")) {
      a.innerHTML = `<form id="loginForm" class="auth"><input type="email" id="email" placeholder="이메일" required autocomplete="email"><button class="primary" type="submit">로그인 링크 받기</button></form>`;
      foot.textContent = "";
    }
  }

  // ── actions ────────────────────────────────────────────────
  function toggle(id) {
    if (!canEdit()) return;
    if (state.done.has(id)) state.done.delete(id); else state.done.add(id);
    render();
    scheduleSave();
  }

  function removeCustom(id) {
    if (!canEdit()) return;
    const c = state.custom.find((x) => x.id === id);
    if (!c || !confirm(`'${c.name}' 카드를 삭제할까요?`)) return;
    state.custom = state.custom.filter((x) => x.id !== id);
    state.done.delete(id);
    render();
    scheduleSave();
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `progress-export-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJSON(file) {
    if (!canEdit()) return;
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { alert("JSON 파일을 읽지 못했어요."); return; }
    if (!parsed || !Array.isArray(parsed.done)) { alert("형식이 맞지 않아요. (done 배열이 필요)"); return; }
    const next = normalize(parsed);
    const known = new Set([...monsters.elites, ...monsters.bosses].map((m) => m.id).concat(next.custom.map((c) => c.id)));
    const unknown = [...next.done].filter((id) => !known.has(id));
    const msg = `완료 ${next.done.size}개, 직접 추가 ${next.custom.length}개를 불러옵니다.\n` +
      (unknown.length ? `(목록에 없는 id ${unknown.length}개는 그대로 보관)\n` : "") +
      `지금 기록(완료 ${state.done.size}개)을 덮어쓸까요?`;
    if (!confirm(msg)) return;
    state = next;
    render();
    scheduleSave();
  }

  // ── events ─────────────────────────────────────────────────
  function bindUI() {
    document.querySelector(".chips").addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      filter.cat = btn.dataset.cat;
      $$(".chip").forEach((c) => c.classList.toggle("on", c === btn));
      render();
    });
    $("#undoneOnly").addEventListener("change", (e) => { filter.undone = e.target.checked; render(); });
    $("#search").addEventListener("input", (e) => { filter.q = e.target.value.trim().toLowerCase(); render(); });

    const main = document.querySelector("main");
    main.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (del) { e.stopPropagation(); removeCustom(del.dataset.del); return; }
      const card = e.target.closest(".card");
      if (card) toggle(card.dataset.id);
    });
    main.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".card");
      if (!card || e.target !== card) return;
      e.preventDefault();
      toggle(card.dataset.id);
    });

    $("#customForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!canEdit()) return;
      const name = $("#cName").value.trim();
      if (!name) return;
      state.custom.push({ id: newId(), name, cat: $("#cCat").value, note: $("#cNote").value.trim() });
      $("#cName").value = "";
      $("#cNote").value = "";
      render();
      scheduleSave();
      $("#cName").focus();
    });

    $("#btnExport").addEventListener("click", exportJSON);
    $("#btnImport").addEventListener("click", () => $("#fileImport").click());
    $("#fileImport").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importJSON(f);
      e.target.value = "";
    });

    $("#authArea").addEventListener("submit", async (e) => {
      if (e.target.id !== "loginForm") return;
      e.preventDefault();
      const email = $("#email").value.trim();
      if (!email) return;
      const btn = e.target.querySelector("button");
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = "보내는 중…";
      const redirect = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
      if (error) {
        const wait = Number((error.message.match(/after (\d+) seconds?/) || [])[1]);
        if (wait) {
          setStatus(`방금 보낸 메일이 있어요. 메일함(스팸함 포함)을 먼저 확인해 주세요.`, "warn");
          cooldown(btn, wait);
        } else {
          setStatus("로그인 메일 전송 실패: " + error.message, "err");
          btn.disabled = false;
          btn.textContent = "로그인 링크 받기";
        }
        return;
      }
      setStatus("메일함에서 로그인 링크를 눌러주세요 ✉️", "ok");
      cooldown(btn, 60);
    });
    function cooldown(btn, sec) {
      btn.disabled = true;
      const tick = () => {
        if (!btn.isConnected) return;
        if (sec <= 0) { btn.disabled = false; btn.textContent = "다시 보내기"; return; }
        btn.textContent = `다시 보내기 (${sec--}초)`;
        setTimeout(tick, 1000);
      };
      tick();
    }
    $("#authArea").addEventListener("click", async (e) => {
      if (e.target.id !== "btnLogout") return;
      if (saveTimer) await flushSave();
      await sb.auth.signOut();
    });
  }

  // ── init ───────────────────────────────────────────────────
  async function init() {
    bindUI();
    try {
      const r = await fetch("data/monsters.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      monsters = await r.json();
    } catch (e) {
      console.error(e);
      setStatus("몬스터 목록(data/monsters.json)을 불러오지 못했어요", "err");
    }

    // 매직링크 실패(#error=...)로 돌아온 경우 안내 후 주소 정리
    let authError = "";
    if (location.hash.includes("error=")) {
      const h = new URLSearchParams(location.hash.slice(1));
      authError = h.get("error_code") === "otp_expired"
        ? "로그인 링크가 만료됐어요. 다시 요청한 뒤 가장 최근 메일의 링크를 한 번만 눌러주세요."
        : "로그인 실패: " + (h.get("error_description") || h.get("error"));
      history.replaceState(null, "", location.pathname + location.search);
    }

    const configured = CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY;
    if (configured && window.supabase?.createClient) {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      mode = "init";
      const { data } = await sb.auth.getSession();
      await applySession(data.session);
      if (authError) setStatus(authError, "err");
      sb.auth.onAuthStateChange((_ev, session) => {
        // 콜백 안에서 바로 supabase를 호출하면 교착될 수 있어 한 틱 미룸
        setTimeout(() => applySession(session), 0);
      });
    } else {
      if (configured) console.warn("supabase-js 로드 실패 → 로컬 모드");
      mode = "local";
      state = loadLocal(null) || emptyState();
      render();
    }
  }

  init();
})();
