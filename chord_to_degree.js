// ==UserScript==
// @name			[chordwiki] コード to ディグリー
// @description			ja.chordwiki.orgのキーが明記されいるページのコード名をディグリーに変換（キー未表記ページは推定）
// @namespace		https://greasyfork.org/ja/users/1023652
// @version			1.0.0.6
// @author			ゆにてぃー
// @match			https://ja.chordwiki.org/wiki*
// @icon			https://www.google.com/s2/favicons?sz=64&domain=ja.chordwiki.org
// @license			MIT
// @grant			GM_xmlhttpRequest
// @grant			GM_registerMenuCommand
// ==/UserScript==

(async function(){
	'use strict';
	let currentUrl = document.location.href;
	let updating = false;
	const debugging = false;
	const debug = debugging ? console.log : ()=>{};
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;

	// 転調判定のしきい値
	const MOD_MIN_FIRST = 1.5; // ブロック内ベストキーの最低スコア
	const MOD_CHANGE_DELTA = 1.2; // 直前キーとの差がこの値以上で転調
	const MIN_TOKENS_FOR_INFER = 7;
	let isDeg = false;

	async function main(){
		addManualInferFab();
		addConvertFab();
		setupLineKeyUI(); // キー未表記ページ: ブロック推定→行ドロップダウン初期化
		attachLineKeyHandlers(); // 変更伝播（「-」継承の再計算）
		hookPlayKeyObserver(); // Play: 変更検出（グローバルキーありページ）
		await restoreSavedSelections();
		addTransposeBar();
		applyResponsiveLayout();
	}

	// ===== 右下固定の丸ボタン（FAB） =====
	function addConvertFab(){
		if(document.getElementById("cw-degree-fab"))return;
		const btn = h('button',{
				id: "cw-degree-fab",
				title: "コード名 ↔ ディグリー",
				onClick: ()=>{
					const hasKey = !!document.querySelector('p.key') || !!document.querySelector('select.cw-line-key');
					if(!hasKey){alert("キーがわからない");return;}
					if(!isDeg){
						convertDocument("deg");
						isDeg = true;
						btn.textContent = "C";
					}else{
						convertDocument("orig");
						isDeg = false;
						btn.textContent = "Ⅰ";
					}
				},
				onmouseenter: ()=>{
					btn.style.transform = 'scale(1.06)';
					btn.style.boxShadow = '0 10px 24px rgba(0,0,0,.30)';
				},
				onmouseleave: ()=>{
					btn.style.transform = '';
					btn.style.boxShadow = '0 6px 16px rgba(0,0,0,.25)';
				},
				textContent: "Ⅰ",
				style: {
					position: 'fixed',
					right: '16px',
					bottom: '16px',
					width: '56px',
					height: '56px',
					borderRadius: '9999px',
					zIndex: '2147483647',
					border: 'none',
					cursor: 'pointer',
					boxShadow: '0 6px 16px rgba(0,0,0,.25)',
					background: '#ffffff',
					fontSize: '20px',
					lineHeight: '56px',
					textAlign: 'center',
					userSelect: 'none'
				}
			},
		);
		document.body.appendChild(btn);
	}

	function addManualInferFab(){
		if(document.getElementById("cw-manual-infer-fab"))return;
		const btn = h('button',{
				id: "cw-manual-infer-fab",
				title: "キーを推論してドロップダウンに反映（上書き）",
				onClick: ()=>{
					const blocks = buildLineBlocks();
					if(!blocks.length)return;

					// グローバルキー有無に関係なく推定シードを実行（上書き）
					seedKeysByBlocks(blocks);

					// 継承を再計算して適用
					const lines = [...document.querySelectorAll("p.line")].filter(l=>l.className === "line");
					if(lines.length){
						recomputeEffectiveKeysFrom(lines,lines[0],null); // グローバルフォールバック無しで再計算
						if(isDeg){
							for(let i = 0;i < lines.length;i++){
								processLine(lines[i],lines[i].dataset.effectiveKey || null,"deg");
							}
						}
					}
					applyResponsiveLayout();
				},
				onmouseenter: ()=>{
					btn.style.transform = 'scale(1.06)';
					btn.style.boxShadow = '0 10px 24px rgba(0,0,0,.30)';
				},
				onmouseleave: ()=>{
					btn.style.transform = '';
					btn.style.boxShadow = '0 6px 16px rgba(0,0,0,.25)';
				},
				textContent: "推",
				style: {
					position: 'fixed',
					right: '16px',
					bottom: '84px', // Ⅰ/C ボタンの上
					width: '44px',
					height: '44px',
					borderRadius: '9999px',
					zIndex: '2147483647',
					border: 'none',
					cursor: 'pointer',
					boxShadow: '0 6px 16px rgba(0,0,0,.25)',
					background: '#ffffff',
					fontSize: '16px',
					lineHeight: '44px',
					textAlign: 'center',
					userSelect: 'none'
				}
			}
		);
		document.body.appendChild(btn);
	}

	// 移調用
	function addTransposeBar(){
		if(document.getElementById("cw-transpose-bar")) return;

		const hook = document.querySelector('div[oncopy], div[onCopy]');
		if(!hook || !hook.parentNode) return;

		const currMajor = getCurrentMajorKeyForTranspose();

		// UI要素
		const label = h('span', {
			id: 'cw-transpose-label',
			textContent: `現在 key: ${currMajor}`,
			style: { marginRight: '8px', fontWeight: '600' }
		});

		const sel = h('select', {
			id: 'cw-transpose-select',
			title: '移動先のキー（C/Am など）',
			style: { marginRight: '8px', padding: '2px 6px', fontSize: '12px' }
		});
		for(const [maj, relm] of TRANSPOSE_PAIRS){
			const opt = document.createElement('option');
			opt.value = maj;
			opt.textContent = `${maj} (${relm})`;
			sel.appendChild(opt);
		}
		// 既定は C(Am)
		sel.value = 'C';

		const btn = h('button', {
			id: 'cw-transpose-go',
			textContent: 'key に移動',
			title: '選択したキーに移調したページへ移動します',
			onClick: ()=>{
				const fromMaj = getCurrentMajorKeyForTranspose();
				const toMaj = sel.value || 'C';
				const url = buildTransposeUrl(toMaj);
				location.href = url;
			},
			onmouseenter: (e)=>{ e.currentTarget.style.filter = 'brightness(0.96)'; },
			onmouseleave: (e)=>{ e.currentTarget.style.filter = ''; },
			style: {
				padding: '4px 10px',
				border: '1px solid #d1d5db',
				background: '#fff',
				borderRadius: '6px',
				cursor: 'pointer',
				fontSize: '12px'
			}
		});

		// ラッパー
		const bar = h('div', {
			id: 'cw-transpose-bar',
			style: {
				display: 'flex',
				alignItems: 'center',
				flexWrap: 'wrap',
				gap: '6px',
				margin: '8px 0 12px 0',
				padding: '8px 10px',
				border: '1px solid #e5e7eb',
				background: '#f9fafb',
				borderRadius: '8px'
			}
		}, label, sel, btn);

		// oncopy コンテナの直前に差し込む
		hook.parentNode.insertBefore(bar, hook);
	}

	// ===== ローマ数字基礎 =====
	const ROMAN = ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ"];

	function buildLetterOrder(key){
		const L = ["C","D","E","F","G","A","B"];
		const k = (key || "").toUpperCase().match(/^([A-G])/ )?.[1] || "C";
		const i = L.indexOf(k);
		return i < 0 ? L.slice() : L.slice(i).concat(L.slice(0,i));
	}

	function buildRomanMap(key){
		const order = buildLetterOrder(key);
		const m = {};
		for(let i = 0;i < order.length;i++){
			m[order[i]] = ROMAN[i];
		}
		return m;
	}

	// ===== 音名↔半音、キー候補、キー分解 =====
	const NOTE_TO_PC = {"C":0,"B#":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"Fb":4,"E#":5,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11,"Cb":11};
	const PC_TO_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
	const PC_TO_FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

	function nameToPc(name){
		const n = (typeof name === "string" ? name : String(name ?? "")).trim();
		return NOTE_TO_PC[n] != null ? NOTE_TO_PC[n] : null;
	}
	function pcToName(pc,prefer = "either"){
		pc = ((pc % 12) + 12) % 12;
		if(prefer === "flat")return PC_TO_FLAT[pc];
		if(prefer === "sharp")return PC_TO_SHARP[pc];
		return PC_TO_SHARP[pc];
	}

	const KEY_CAND_MAJOR = ["C","G","D","A","E","B","F#","C#","F","Bb","Eb","Ab","Db","Gb","Cb"];
	const KEY_CAND_MINOR = ["Am","Em","Bm","F#m","C#m","G#m","D#m","A#m","Dm","Gm","Cm","Fm","Bbm","Ebm","Abm"];

	function splitKeyName(key){
		const m = (key || "").trim().match(/^([A-G])([#bB]?)(m)?$/i);
		if(!m)return {tonic:"C",isMinor:false,accPrefer:"either"};
		const letter = m[1].toUpperCase();
		const acc = (m[2] || "") === "B" ? "b" : (m[2] || "");
		const isMinor = !!m[3];
		const accPrefer = acc === "b" ? "flat" : (acc === "#" ? "sharp" : "either");
		return {tonic:letter + acc,isMinor,accPrefer};
	}

	function relativeMajorName(minorKey){
		const s = splitKeyName(minorKey);
		if(!s.isMinor)return s.tonic;
		const pcMin = nameToPc(s.tonic);
		const pcMaj = (pcMin + 3) % 12; // +3半音で相対メジャー
		return pcToName(pcMaj,s.accPrefer);
	}

	// ===== キーの調号マップ（メジャー/マイナー対応） =====
	function buildKeyAccidentalMap(key){
		const s = splitKeyName(key);
		const k = s.isMinor ? relativeMajorName(key) : s.tonic;

		const SHARP_KEYS = ["C","G","D","A","E","B","F#","C#"];
		const FLAT_KEYS = ["C","F","Bb","Eb","Ab","Db","Gb","Cb"];
		const SHARP_ORDER = ["F","C","G","D","A","E","B"];
		const FLAT_ORDER = ["B","E","A","D","G","C","F"];
		const map = {C:"",D:"",E:"",F:"",G:"",A:"",B:""};

		let idxSharp = SHARP_KEYS.indexOf(k);
		let idxFlat = FLAT_KEYS.indexOf(k);
		if(idxSharp >= 0){
			for(let i = 0;i < idxSharp;i++)map[SHARP_ORDER[i]] = "#";
		}else if(idxFlat >= 0){
			for(let i = 0;i < idxFlat;i++)map[FLAT_ORDER[i]] = "b";
		}
		return map;
	}

	// 単音 → ローマ数字（キーの調号と比較して相対臨時記号を付与）
	function noteToDegree(note,romanMap,keyAcc){
		const m = (note || "").match(/^([A-G])([#b])?$/i);
		if(!m)return note;
		const letter = m[1].toUpperCase();
		const acc = m[2] || "";
		const base = romanMap[letter] || letter;
		const dia = keyAcc[letter] || "";
		let rel = "";
		if(acc === dia)rel = "";
		else if(acc === "" && dia === "#")rel = "b";
		else if(acc === "" && dia === "b")rel = "#";
		else if(acc === "#" && dia === "")rel = "#";
		else if(acc === "b" && dia === "")rel = "b";
		else if(acc === "#" && dia === "b")rel = "##";
		else if(acc === "b" && dia === "#")rel = "bb";
		return base + rel;
	}

	// コード全体："F#m7-5" "C#7(b9)" "Aadd9/B" "Baug/F" "/C" "(F#m7)" "（/C）" など
	function convertChordSymbol(sym,romanMap,keyAcc){
		const s = (sym || "").trim();
		if(s === "N.C.")return s;

		// 1) 先に「( … ) / （ … ）」で丸ごと包まれている形を処理
		const mWrap = s.match(/^([（\(])\s*(.+?)\s*([）\)])$/);
		if(mWrap){
			const left = mWrap[1], inner = mWrap[2], right = mWrap[3];
			if(/\s/.test(inner)){
				const parts = inner.split(/\s+/).filter(Boolean).map(t=>convertChordSymbol(t,romanMap,keyAcc));
				return left + parts.join(" ") + right;
			}
			return left + convertChordSymbol(inner,romanMap,keyAcc) + right;
		}

		// 2) ベースのみ "/C" など
		const mSlash = s.match(/^\/\s*([A-G](?:#|b)?)\s*$/i);
		if(mSlash){
			if(!romanMap || !keyAcc)return s;
			const bass = mSlash[1];
			const bassDeg = noteToDegree(bass,romanMap,keyAcc);
			return "/" + bassDeg;
		}

		// 3) 通常パターン
		const re = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/i;
		const m = s.match(re);
		if(!m)return s;

		const root = m[1], suffix = m[2] || "", bass = m[3] || "";
		const rootDeg = noteToDegree(root,romanMap,keyAcc);
		const bassDeg = bass ? noteToDegree(bass,romanMap,keyAcc) : "";
		return rootDeg + suffix + (bassDeg ? ("/" + bassDeg) : "");
	}

	// ===== Key 抽出（Play優先） =====
	function extractEffectiveKey(text){
		const t = (text || "").trim();
		let play = null, orig = null, key = null;

		const parts = t.split(/[\/｜\|]/);
		for(let i = 0;i < parts.length;i++){
			const seg = parts[i];
			let m = null;

			m = seg.match(/Play[:：]\s*([A-G](?:#|b)?)/i);
			if(m)play = m[1];

			m = seg.match(/Original\s*[Kk]ey[:：]\s*([A-G](?:#|b)?)/i);
			if(m)orig = m[1];
			m = seg.match(/原曲キー[:：]\s*([A-G](?:#|b)?)/i);
			if(m)orig = m[1];

			m = seg.match(/(?<!Original\s)[Kk]ey[:：]\s*([A-G](?:#|b)?)/);
			if(m)key = m[1];
			m = seg.match(/キー[:：]\s*([A-G](?:#|b)?)/i);
			if(m)key = m[1];

			m = seg.match(/演奏キー[:：]\s*([A-G](?:#|b)?)/i);
			if(m)play = m[1];
			m = seg.match(/移調後(?:の)?キー[:：]\s*([A-G](?:#|b)?)/i);
			if(m)play = m[1];
			m = seg.match(/プレイ[:：]\s*([A-G](?:#|b)?)/i);
			if(m)play = m[1];
		}
		return play || key || orig || null;
	}

	// ===== 推定用: 簡易パースとスコアリング =====
	function parseChordSymbolBasic(sym){
		let s = (sym || "").trim();
		if(!s || s === "N.C.")return null;
		const wrap = s.match(/^([（\(])\s*(.+?)\s*([）\)])$/);
		if(wrap)s = wrap[2];

		let m = s.match(/^\/\s*([A-G](?:#|b)?)\s*$/i);
		if(m)return {root:null,bass:m[1].toUpperCase(),quality:null,isDom7:false,isHalfDim:false};

		m = s.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/i);
		if(!m)return null;
		const root = m[1].toUpperCase();
		const q = (m[2] || "");
		const bass = m[3] ? m[3].toUpperCase() : null;

		let quality = "maj";
		if(/(dim|°|o)/i.test(q))quality = "dim";
		else if(/aug|\+/i.test(q))quality = "aug";
		else if(/m(?!aj)/.test(q))quality = "min";
		else quality = "maj";

		const isDom7 = /(^|[^a-z])7(?!-?5)/i.test(q);
		const isHalfDim = /m7-5|ø/i.test(q);

		return {root,bass,quality,isDom7,isHalfDim};
	}

	const EXPECT_MAJOR = {1:"maj",2:"min",3:"min",4:"maj",5:"maj",6:"min",7:"dim"};
	const EXPECT_MINOR = {1:"min",2:"dim",3:"maj",4:"min",5:"min",6:"maj",7:"maj"};

	function degreeParts(note,romanMap,keyAcc){
		const d = noteToDegree(note,romanMap,keyAcc);
		const m = d.match(/^([ⅠⅡⅢⅣⅤⅥⅦ])([#b]{1,2})?$/);
		if(!m)return {roman:null,accs:""};
		return {roman:m[1],accs:m[2] || ""};
	}
	function romanToIndex(r){
		return {"Ⅰ":1,"Ⅱ":2,"Ⅲ":3,"Ⅳ":4,"Ⅴ":5,"Ⅵ":6,"Ⅶ":7}[r] || null;
	}

	function scoreChordForKey(ch,keyName){
		const s = splitKeyName(keyName);
		const romanMap = buildRomanMap(s.tonic);
		const keyAcc = buildKeyAccidentalMap(keyName);

		let score = 0;

		if(ch.root){
			const dp = degreeParts(ch.root,romanMap,keyAcc);
			if(dp.roman){
				const diatonic = dp.accs === "";
				if(diatonic)score += 2; else score -= dp.accs.length;
				const idx = romanToIndex(dp.roman);
				//const expect = s.isMinor ? EXPECT_MINOR[idx] : EXPECT_MAJOR[idx];
				const expect = EXPECT_MAJOR[idx];

				if(ch.quality === "dim"){
					score += expect === "dim" ? 1 : -0.5;
				}else if(ch.quality === "min"){
					score += expect === "min" ? 1 : -0.25;
				}else if(ch.quality === "maj"){
					if(expect === "maj")score += 1;
					else if(s.isMinor && idx === 5)score += 0.8;
					else score -= 0.25;
				}else{
					score -= 0.1;
				}
				if(ch.isDom7 && idx === 5)score += 0.5;
				if(ch.isHalfDim && idx === 7)score += 0.5;
			}
		}

		if(ch.bass){
			const dpb = degreeParts(ch.bass,romanMap,keyAcc);
			if(dpb.roman){
				score += dpb.accs === "" ? 0.25 : -0.25;
			}
		}
		return score;
	}

	function scoreTokensForKey(tokens,keyName){
		let s = 0;
		for(let i = 0;i < tokens.length;i++)s += scoreChordForKey(tokens[i],keyName);
		return s;
	}
	function bestKeyAndScore(tokens){
		//const cand = [...KEY_CAND_MAJOR,...KEY_CAND_MINOR];
		const cand = KEY_CAND_MAJOR;
		let bestKey = "C", bestScore = Number.NEGATIVE_INFINITY;
		for(let i = 0;i < cand.length;i++){
			const k = cand[i];
			const sc = scoreTokensForKey(tokens,k);
			if(sc > bestScore){bestScore = sc; bestKey = k;}
		}
		return {bestKey,bestScore};
	}

	function inferKeyFromChordArray(chords){
		const toks = chords.map(parseChordSymbolBasic).filter(Boolean);
		if(!toks.length)return "C";
		const {bestKey,bestScore} = bestKeyAndScore(toks);
		return bestScore < -1 ? "C" : bestKey;
	}

	// ===== ブロック構築（div[oncopy]/div[onCopy] 内を優先） =====
	function buildLineBlocks(){
		const container = document.querySelector('div[oncopy], div[onCopy]') || document;
		// p.line と br をドキュメント順に走査し、次のいずれかでブロックを区切る：
		// - <br>
		// - p.line 以外（例: p.line.comment など）は「境界」として扱う
		const seq = Array.from(container.querySelectorAll('p.line, br'));
		const blocks = [];
		let cur = [];
		for(let i = 0;i < seq.length;i++){
			const el = seq[i];
			if(el.tagName === 'BR'){
				if(cur.length){blocks.push(cur); cur = [];}
				continue;
			}
			// p.line 系
			if(el.tagName === 'P'){
				if(el.className === 'line'){
					cur.push(el);
				}else{
					// line comment などに遭遇 → ここで区切る
					if(cur.length){blocks.push(cur); cur = [];}
				}
			}
		}
		if(cur.length)blocks.push(cur);
		// 念のため、line を1つ以上含むもののみ返す
		return blocks.filter(b=>b.some(l=>l.className === 'line'));
	}

	function collectTokensFromLines(lines){
		const tokens = [];
		for(let i = 0;i < lines.length;i++){
			const line = lines[i];
			const spans = line.querySelectorAll('span.chord');
			for(let j = 0;j < spans.length;j++){
				const raw = (spans[j].dataset.originalChord || spans[j].textContent || "").trim();
				const tok = parseChordSymbolBasic(raw);
				if(tok)tokens.push(tok);
			}
		}
		return tokens;
	}

	// ===== 行ドロップダウン（「-」=継承） =====
	const KEY_OPTIONS = [
		"C","G","D","A","E","B","F#","C#","F","Bb","Eb","Ab","Db","Gb","Cb",
		//"Am","Em","Bm","F#m","C#m","G#m","D#m","A#m","Dm","Gm","Cm","Fm","Bbm","Ebm","Abm"
	];

	function createLineKeySelect(selectedValue = "-"){
		const sel = document.createElement("select");
		sel.className = "cw-line-key";
		sel.title = "この行のキー（推定/継承）";

		{
			const opt = document.createElement("option");
			opt.value = "-"; opt.textContent = "-";
			sel.appendChild(opt);
		}
		for(let i = 0;i < KEY_OPTIONS.length;i++){
			const k = KEY_OPTIONS[i];
			const opt = document.createElement("option");
			opt.value = k; opt.textContent = k;
			sel.appendChild(opt);
		}
		sel.value = selectedValue || "-";

		updateSelectColor(sel);
		Object.assign(sel.style,{
			position: "absolute",
			fontSize: "11px",
			opacity: "0.85",
			zIndex: "2147483647"
		});

		if(isMobileView()){
			sel.style.left = "5px";
			sel.style.top = "-30px";
			sel.style.background = "#f3f4f6";
			sel.style.border = "1px solid #d1d5db";
		}else{
			sel.style.left = "-50px";
			sel.style.top = "-16px";
		}

		sel.addEventListener("mouseenter",()=>{sel.style.opacity = "1";});
		sel.addEventListener("mouseleave",()=>{sel.style.opacity = "0.85";});
		return sel;
	}

	function updateSelectColor(sel){
		if(!sel)return;
		sel.style.color = (sel.value && sel.value !== "-") ? "#dc143c" : "";
	}

	function applyResponsiveLayout(){
		const mobile = isMobileView();
		const lines = document.querySelectorAll("p.line");

		for(let i = 0;i < lines.length;i++){
			const line = lines[i];
			const sel = line.querySelector(":scope > select.cw-line-key");

			// セレクトがあれば位置を再適用（画面回転・リサイズに対応）
			if(sel){
				if(mobile){
					sel.style.left = "5px";
					sel.style.top = "-30px";
					sel.style.background = "#f3f4f6";
					sel.style.border = "1px solid #d1d5db";
				}else{
					sel.style.left = "-50px";
					sel.style.top = "-16px";
				}
			}

			// 行の上側に余白を付けて、ドロップダウンが「行と行の間」に来るようにする
			if(mobile){
				if(!line.dataset.cwMobileSpaced){
					// 既存のinline marginTopを退避してから上書き
					line.dataset.cwPrevMarginTop = line.style.marginTop || "";
					line.style.marginTop = "32px"; // ドロップダウンの -30px を収める余白
					line.dataset.cwMobileSpaced = "1";
				}
			}else{
				// PCに戻ったら元のmarginに復帰
				if(line.dataset.cwMobileSpaced){
					line.style.marginTop = line.dataset.cwPrevMarginTop || "";
					delete line.dataset.cwMobileSpaced;
					delete line.dataset.cwPrevMarginTop;
				}
			}
		}
	}

	// ブロック推定→行セレクト生成＆初期化（1ブロックの先頭行のみ明示キー、残りは「-」）
	function setupLineKeyUI(){
		const hasGlobalKey = !!document.querySelector("p.key");

		const blocks = buildLineBlocks();
		if(!blocks.length)return;

		// まず全対象行に select を装着
		for(let b = 0;b < blocks.length;b++){
			const lines = blocks[b];
			for(let i = 0;i < lines.length;i++){
				const line = lines[i];
				if(line.className !== "line")continue;
				if(!line.querySelector(":scope > select.cw-line-key")){
					const cs = window.getComputedStyle(line);
					if(cs.position === "static")line.style.position = "relative";
					const sel = createLineKeySelect("-");
					line.insertBefore(sel,line.firstChild);
				}
			}
		}

		// ブロック単位で推定 & 転調判定 → 初期シード
		if(!hasGlobalKey){
			seedKeysByBlocks(blocks);
		}
		applyResponsiveLayout();
	}

	function seedKeysByBlocks(blocks){
		let prevEffective = null;

		for(let b = 0;b < blocks.length;b++){
			const lines = blocks[b];

			// このブロックのトークンを取得
			let tokens = collectTokensFromLines(lines);

			// ★最初のブロックでコード数が少なければ、次ブロック以降を順に結合して閾値を満たすまで拡張
			if(b === 0 && tokens.length < MIN_TOKENS_FOR_INFER){
				let nb = b + 1;
				while(nb < blocks.length && tokens.length < MIN_TOKENS_FOR_INFER){
					tokens = tokens.concat(collectTokensFromLines(blocks[nb]));
					nb++;
				}
			}

			let explicitKey = null;

			// ★コード数が閾値未満なら推定しない（= 継承）
			if(tokens.length >= MIN_TOKENS_FOR_INFER){
				if(b === 0){
					// 先頭ブロック：結合結果で推定（既存ルール）
					const {bestKey} = bestKeyAndScore(tokens);
					explicitKey = bestKey || "C";
				}else{
					// 以降のブロック：転調検出も既存ルール＋コード数閾値を満たすときのみ
					const {bestKey,bestScore} = bestKeyAndScore(tokens);
					const prevScore = tokens.length ? scoreTokensForKey(tokens,prevEffective) : 0;
					if(bestScore >= MOD_MIN_FIRST && bestKey !== prevEffective && bestScore >= prevScore + MOD_CHANGE_DELTA){
						explicitKey = bestKey;
					}
				}
			}

			// セレクトと effectiveKey を反映
			for(let i = 0;i < lines.length;i++){
				const line = lines[i];
				if(line.className !== "line")continue;
				const sel = line.querySelector(":scope > select.cw-line-key");
				if(i === 0){
					if(explicitKey){
						sel.value = explicitKey;
						updateSelectColor(sel);
						line.dataset.effectiveKey = explicitKey;
						prevEffective = explicitKey;
					}else{
						// 推定無し → 継承（prevEffective が無ければ空）
						sel.value = "-";
						updateSelectColor(sel);
						line.dataset.effectiveKey = prevEffective || "";
					}
				}else{
					sel.value = "-";
					updateSelectColor(sel);
					line.dataset.effectiveKey = prevEffective || "";
				}
			}
		}
	}

	// セレクト変更→「-」継承を後続へ伝播
	function attachLineKeyHandlers(){
		const lines = [...document.querySelectorAll("p.line")].filter(l=>l.className === "line");
		for(let i = 0;i < lines.length;i++){
			const line = lines[i];
			const sel = line.querySelector(":scope > select.cw-line-key");
			if(!sel)continue;
			sel.addEventListener("change",async ()=>{
				updateSelectColor(sel);
				recomputeEffectiveKeysFrom(lines,line);
				await saveCurrentOverrides();
				if(isDeg){
					for(let j = 0;j < lines.length;j++){
						processLine(lines[j],lines[j].dataset.effectiveKey || null,"deg");
					}
				}
			});
		}
	}

	function recomputeEffectiveKeysFrom(lines,startLine,globalFallbackKey = null){
		let lastExplicit = null;
		for(let i = 0;i < lines.length;i++){
			const line = lines[i];
			const sel = line.querySelector(":scope > select.cw-line-key");
			const v = sel ? sel.value : "-";
			if(line === startLine)break;
			if(v && v !== "-"){
				lastExplicit = v;
			}else{
				if(line.dataset.effectiveKey){
					lastExplicit = line.dataset.effectiveKey;
				}
			}
		}

		let prev = lastExplicit != null ? lastExplicit : (globalFallbackKey || null);
		let startIdx = lines.indexOf(startLine);
		if(startIdx < 0)startIdx = 0;
		for(let i = startIdx;i < lines.length;i++){
			const line = lines[i];
			const sel = line.querySelector(":scope > select.cw-line-key");
			const v = sel ? sel.value : "-";
			if(v && v !== "-"){
				prev = v;
				line.dataset.effectiveKey = prev;
			}else{
				line.dataset.effectiveKey = prev || "";
			}
		}
	}

	// ===== 既存ライン処理 =====
	function extractKeyFromParagraph(el){
		const txt = el.innerText || el.textContent || "";
		return extractEffectiveKey(txt);
	}

	// mode: "deg"（度数へ）/ "orig"（元へ）
	function processLine(lineEl,currentKey,mode){
		if(!lineEl)return;
		const romanMap = currentKey ? buildRomanMap(currentKey) : null;
		const keyAcc = currentKey ? buildKeyAccidentalMap(currentKey) : null;
		lineEl.querySelectorAll("span.chord").forEach((el)=>{
			const textNow = el.innerText || el.textContent || "";
			if(!el.dataset.originalChord){
				el.dataset.originalChord = textNow;
			}
			if(mode === "deg"){
				const source = el.dataset.originalChord;
				if(!source)return;
				if(source === "N.C."){
					el.innerText = source;
					el.dataset.degreeChord = source;
					return;
				}
				if(!romanMap || !keyAcc){
					el.innerText = source;
					return;
				}
				const converted = convertChordSymbol(source,romanMap,keyAcc);
				el.innerText = converted;
				el.dataset.degreeChord = converted;
			}else if(mode === "orig"){
				if(el.dataset.originalChord){
					el.innerText = el.dataset.originalChord;
				}
			}
		});
	}

	// 文書全体（グローバルKey or 行単位effectiveKey）で変換
	function convertDocument(mode = "deg"){
		const pk = document.querySelector("p.key");
		const globalKey = pk ? extractKeyFromParagraph(pk) : null;

		// 行リスト＆UI準備
		const lines = [...document.querySelectorAll("p.line")].filter(l=>l.className === "line");
		if(lines.length){
			if(!lines[0].querySelector(":scope > select.cw-line-key")){
				setupLineKeyUI();
				attachLineKeyHandlers();
			}
			// ★グローバルキーをフォールバックに、「-」継承を含めて有効キーを再計算
			recomputeEffectiveKeysFrom(lines,lines[0],globalKey);
		}

		// 各行を有効キーで変換（行ドロップダウンが常に優先）
		for(let i = 0;i < lines.length;i++){
			const line = lines[i];
			const lineKey = line.dataset.effectiveKey || null;
			processLine(line,lineKey,mode);
		}
	}


	// Play: が書き換わったら自動で再変換（度数表示中のみ）
	function hookPlayKeyObserver(){
		const target = document.querySelector('p.key') || document.body;
		if(!target)return;
		let timer = null;
		const obs = new MutationObserver((muts)=>{
			let touched = false;
			for(const m of muts){
				const node = m.target;
				if(!node)continue;
				const container = (node.nodeType === 3 ? node.parentNode : node);
				if(container?.closest && container.closest('p.key')){
					touched = true;break;
				}
			}
			if(touched && isDeg){
				if(timer)clearTimeout(timer);
				timer = setTimeout(()=>{convertDocument("deg");updateTransposeBarLabel();},120);
			}
		});
		obs.observe(document.body,{subtree:true,childList:true,characterData:true});
	}

	const DB_NAME = 'cw-degree';
	const STORE_NAME = 'line-key-overrides';
	const SAVE_ID = 522; // 既存ヘルパーのデフォルトに合わせる

	function b64EncodeUtf8(str){
		try{
			const encoder = new TextEncoder();
			const uint8Array = encoder.encode(str);
			const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
			return btoa(binaryString);
		}catch(e){
			try{ return btoa(str); }
			catch{ return String(str); }
		}
	}

	function getPageStorageKey(){
		const meta = document.querySelector('head meta[property="og:title"]');
		const title = (meta?.content || document.title || location.pathname || '').trim();
		return b64EncodeUtf8(title || location.href);
	}

	async function loadAllOverrides(){
		try{
			const obj = await getFromIndexedDB(DB_NAME, STORE_NAME, SAVE_ID);
			return obj || {};
		}catch(e){
			console.warn('loadAllOverrides error', e);
			return {};
		}
	}
	async function saveAllOverrides(data){
		try{
			await saveToIndexedDB(DB_NAME, STORE_NAME, data, SAVE_ID);
		}catch(e){
			console.warn('saveAllOverrides error', e);
		}
	}

	// 現在ページの明示指定（-以外）だけを保存
	async function saveCurrentOverrides(){
		const lines = [...document.querySelectorAll("p.line")].filter(l=>l.className === "line");
		if(!lines.length) return;
		const explicit = {};
		for(let i=0;i<lines.length;i++){
			const sel = lines[i].querySelector(":scope > select.cw-line-key");
			if(!sel) continue;
			if(sel.value && sel.value !== "-"){
				explicit[i] = sel.value;
			}
		}
		const key = getPageStorageKey();
		const all = await loadAllOverrides();
		all[key] = {
			lines: explicit,
			updatedAt: new Date().toISOString()
		};
		await saveAllOverrides(all);
	}

	// 保存済みの明示指定をUIへ反映（推論は保存しない）
	async function restoreSavedSelections(){
		const lines = [...document.querySelectorAll("p.line")].filter(l=>l.className === "line");
		if(!lines.length) return;

		const key = getPageStorageKey();
		const all = await loadAllOverrides();
		const entry = all[key];
		if(!entry || !entry.lines) return;

		// 反映
		for(const [idxStr,val] of Object.entries(entry.lines)){
			const idx = parseInt(idxStr,10);
			if(Number.isNaN(idx)) continue;
			const line = lines[idx];
			if(!line) continue;
			const sel = line.querySelector(":scope > select.cw-line-key");
			if(!sel) continue;
			sel.value = val;
			updateSelectColor(sel);
		}

		// 継承と描画の再計算
		const pk = document.querySelector("p.key");
		const globalKey = pk ? extractKeyFromParagraph(pk) : null;
		recomputeEffectiveKeysFrom(lines, lines[0], globalKey);

		if(isDeg){
			for(let i=0;i<lines.length;i++){
				processLine(lines[i], lines[i].dataset.effectiveKey || null, "deg");
			}
		}
	}
	const TRANSPOSE_PAIRS = [
		["C",  "Am"],
		["Db", "Bbm"],
		["D",  "Bm"],
		["Eb", "Cm"],
		["E",  "C#m"],
		["F",  "Dm"],
		["F#", "D#m"],
		["G",  "Em"],
		["Ab", "Fm"],
		["A",  "F#m"],
		["Bb", "Gm"],
		["B",  "G#m"],
	];
	function getCurrentMajorKeyForTranspose(){
		// 1) まずページの p.key（Play/Key/原曲キー）を最優先で使う
		const pk = document.querySelector("p.key");
		let raw = pk ? extractKeyFromParagraph(pk) : null;

		// 2) それが無い場合は、setupLineKeyUI/seedKeysByBlocks で付与済みの
		//    行ごとの推定キー（effectiveKey）を利用（最初に見つかったもの）
		if(!raw){
			const lines = [...document.querySelectorAll("p.line")].filter(l => l.className === "line");
			for(const line of lines){
				const eff = (line.dataset && line.dataset.effectiveKey) ? line.dataset.effectiveKey.trim() : "";
				if(eff){
					raw = eff;
					break;
				}
			}
		}

		// 3) それでも無ければデフォルト C
		if(!raw) raw = "C";

		// 4) C(Am) の “C” に合わせて、もし minor なら相対メジャーへ寄せる
		const s = splitKeyName(raw);
		return s.isMinor ? relativeMajorName(raw) : s.tonic;
	}
	// [-5, +6] の範囲に収まるように差（半音数）を決定
	function computeDeltaSemitone(fromMajor, toMajor){
		const a = nameToPc(fromMajor);
		const b = nameToPc(toMajor);
		if(a == null || b == null) return 0;
		let d = b - a; // -11..+11
		while(d < -5) d += 12;
		while(d > 6) d -= 12;
		return d;
	}
	function getEncodedTitleParam(){
		// 1) フォームから（これが一番確実）
		const input = document.querySelector('#key [name="t"]');
		if(input && input.value){
			return encodeURIComponent(input.value);
		}

		// 2) すでに ?t=... が付いている場合
		try{
			const u = new URL(location.href);
			const t = u.searchParams.get('t');
			if(t){
			// 2重エンコード対策
			return encodeURIComponent(decodeURIComponent(t));
			}
		}catch(e){ /* noop */ }

		// 3) /wiki/<タイトル> 形式から
		const m = location.pathname.match(/\/wiki\/(.+)/);
		if(m && m[1]){
			try{
			// 既にエンコードされているので一旦 decode → encode で正規化
			return encodeURIComponent(decodeURIComponent(m[1]));
			}catch(e){
			// そのまま使う（既にエンコード済み想定）
			return m[1];
			}
		}

		// 4) og:title から
		const og = document.querySelector('meta[property="og:title"]')?.content;
		if(og){
			return encodeURIComponent(og.trim());
		}

		return ""; // 最後の砦
	}
	function getCurrentKeyParam(){
		try{
			const u = new URL(location.href);
			const k = parseInt(u.searchParams.get('key'), 10);
			if(Number.isFinite(k)) return Math.max(-12, Math.min(12, k));
		}catch(e){}
		return 0;
	}
	function normalizeKeyParam(d){
		// 0..11 に畳み込んでから [-6..+6] に丸める（-6 は +6 に寄せる仕様）
		d = ((d % 12) + 12) % 12; // 0..11
		if(d <= 6) return d; // 0..6
		return d - 12; // -5..-1
	}
	function buildTransposeUrl(targetMajor){
		const currMajor = getCurrentMajorKeyForTranspose(); // 現在表示のメジャー
		const currParam = getCurrentKeyParam(); // 現在の ?key=（元→現在 の移調量）

		const currPc = nameToPc(currMajor);
		const targetPc = nameToPc(targetMajor);
		if(currPc == null || targetPc == null){
			return location.href; // フォールバック
		}

		// 元キー(メジャー)のPCを逆算： current = original + currParam
		const originalPc = ((currPc - currParam) % 12 + 12) % 12;

		// 目的キーへの総移調量 = target - original
		let total = normalizeKeyParam(targetPc - originalPc); // [-6..+6]
		if(total === -6) total = 6; // サイト仕様に合わせる

		const tEnc = getEncodedTitleParam();
		const origin = location.origin || (location.protocol + '//' + location.host);
		return `${origin}/wiki.cgi?c=view&t=${tEnc}&key=${total}&symbol=`;
	}
	// Play の表示が動的更新されたらラベルも更新
	function updateTransposeBarLabel(){
		const label = document.getElementById('cw-transpose-label');
		if(!label) return;
		const currMajor = getCurrentMajorKeyForTranspose();
		label.textContent = `現在 key: ${currMajor}`;
	}
	function update(){
		if(updating)return;
		updating = true;
		main();
		setTimeout(()=>{updating = false;},600);
	}

	function locationChange(targetPlace = document){
		const observer = new MutationObserver(mutations=>{
			if(currentUrl !== document.location.href){
				currentUrl = document.location.href;
				try{
					update();
				}catch(error){console.error(error)}
			}
		});
		const config = {childList:true,subtree:true};
		observer.observe(targetPlace,config);
	}

	function isMobileView(){
		return (window.matchMedia && window.matchMedia("(max-width: 768px)").matches)
			|| /Android|iPhone|iPod|Windows Phone|Mobile/i.test(userAgent);
	}

	function openIndexedDB(dbName, storeName){
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(dbName);

			request.onerror = (event) => {
				reject("Database error: " + event.target.errorCode);
			};

			request.onsuccess = (event) => {
				let db = event.target.result;
				if(db.objectStoreNames.contains(storeName)){
					resolve(db);
				}else{
					db.close();
					const newVersion = db.version + 1;
					const versionRequest = indexedDB.open(dbName, newVersion);
					versionRequest.onupgradeneeded = (event) => {
						db = event.target.result;
						db.createObjectStore(storeName, { keyPath: 'id' });
					};
					versionRequest.onsuccess = (event) => {
						resolve(event.target.result);
					};
					versionRequest.onerror = (event) => {
						reject("Database error: " + event.target.errorCode);
					};
				}
			};

			request.onupgradeneeded = (event) => {
				const db = event.target.result;
				db.createObjectStore(storeName, { keyPath: 'id' });
			};
		});
	}

	function saveToIndexedDB(dbName, storeName, data, id = 522){
		return new Promise(async (resolve, reject) => {
			try{
				const db = await openIndexedDB(dbName, storeName);
				const transaction = db.transaction(storeName, 'readwrite');
				const store = transaction.objectStore(storeName);
				const putRequest = store.put({ id: id, data: data });

				putRequest.onsuccess = () => {
					resolve("Data saved successfully.");
				};

				putRequest.onerror = (event) => {
					reject("Data save error: " + event.target.errorCode);
				};
			}catch(error){
				reject(error);
			}
		});
	}

	function getFromIndexedDB(dbName, storeName, id = 522){
		return new Promise(async (resolve, reject) => {
			try{
				const db = await openIndexedDB(dbName, storeName);
				const transaction = db.transaction(storeName, 'readonly');
				const store = transaction.objectStore(storeName);
				const getRequest = store.get(id);

				getRequest.onsuccess = (event) => {
					if(event.target.result){
						// こうしないとfirefox系ブラウザで
						// Error: Not allowed to define cross-origin object as property on [Object] or [Array] XrayWrapper
						// というエラーが出ることがあるので、構造化クローンを使ってコピーする
						// でかいオブジェクトだと効率が悪いのでなにかいい方法があれば教えてください
						resolve(structuredClone(event.target.result.data));
					}else{
						resolve(null);
					}
				};

				getRequest.onerror = (event) => {
					reject("Data fetch error: " + event.target.errorCode);
				};
			}catch(error){
				reject(error);
			}
		});
	}

	function sleep(time){
		return new Promise((resolve)=>{
			setTimeout(()=>{return resolve(time)},time);
		});
	}

	function decodeHtml(html){
		const txt = document.createElement("div");
		txt.innerHTML = html;
		return txt.textContent;
	}

	function h(tag,props = {},...children){
		const el = document.createElement(tag);
		for(const key in props){
			const val = props[key];
			if(key === "style" && typeof val === "object"){
				Object.assign(el.style,val);
			}else if(key.startsWith("on") && typeof val === "function"){
				el.addEventListener(key.slice(2).toLowerCase(),val);
			}else if(key.startsWith("aria-") || key === "role"){
				el.setAttribute(key,val);
			}else if(key === "dataset" && typeof val === "object"){
				for(const dataKey in val){
					if(val[dataKey] != null){
						el.dataset[dataKey] = val[dataKey];
					}
				}
			}else if(key.startsWith("data-")){
				const prop = key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
				el.dataset[prop] = val;
			}else if(key === "ref" && typeof val === "function"){
				val(el);
			}else if(key in el){
				el[key] = val;
			}else{
				el.setAttribute(key,val);
			}
		}
		for(let i = 0;i < children.length;i++){
			const child = children[i];
			if(Array.isArray(child)){
				for(const nested of child){
					if(nested == null || nested === false)continue;
					el.appendChild(typeof nested === "string" || typeof nested === "number" ? document.createTextNode(nested) : nested);
				}
			}else if(child != null && child !== false){
				el.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(child) : child);
			}
		}
		return el;
	}

	function waitElementAndGet({query,searchFunction = 'querySelector',interval = 100,retry = 25,searchPlace = document,faildToThrow = false} = {}){
		if(!query)throw(`query is needed`);
		return new Promise((resolve,reject)=>{
			const MAX_RETRY_COUNT = retry;
			let retryCounter = 0;
			let searchFn;
			switch(searchFunction){
				case'querySelector':
					searchFn = ()=>searchPlace.querySelector(query);
					break;
				case'getElementById':
					searchFn = ()=>searchPlace.getElementById(query);
					break;
				case'XPath':
					searchFn = ()=>{
						let section = document.evaluate(query,searchPlace,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;
						return section;
					};
					break;
				case'XPathAll':
					searchFn = ()=>{
						let sections = document.evaluate(query,searchPlace,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
						let result = [];
						for(let i = 0;i < sections.snapshotLength;i++){
							result.push(sections.snapshotItem(i));
						}
						if(result.length >= 1)return result;
					};
					break;
				default:
					searchFn = ()=>searchPlace.querySelectorAll(query);
			}
			const setIntervalId = setInterval(findTargetElement,interval);
			function findTargetElement(){
				retryCounter++;
				if(retryCounter > MAX_RETRY_COUNT){
					clearInterval(setIntervalId);
					if(faildToThrow){
						return reject(`Max retry count (${MAX_RETRY_COUNT}) reached for query: ${query}`);
					}else{
						console.warn(`Max retry count (${MAX_RETRY_COUNT}) reached for query: ${query}`);
						return resolve(null);
					}
				}
				let targetElements = searchFn();
				if(targetElements && (!(targetElements instanceof NodeList) || targetElements.length >= 1)){
					clearInterval(setIntervalId);
					return resolve(targetElements);
				}
			}
		});
	}

	locationChange();
	main();
})();
