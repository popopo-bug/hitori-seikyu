/*! ひとり請求書 v1.0.0 (web) */
(function(g){g.HS=g.HS||{};g.HS.edition="web";g.HS.version="1.0.0";})(window);
/* ---- core.js ---- */
/* ひとり請求書 — core utilities */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  HS.edition = HS.edition || 'web'; // build で 'web' | 'pro' | 'trial' に置換

  const FW = /[０-９．，－ー―‐＋]/g;
  const FW_MAP = { '．': '.', '，': ',', '－': '-', 'ー': '-', '―': '-', '‐': '-', '＋': '+' };

  /** 全角数字・カンマ・円記号まじりの文字列を数値に。空や不正は 0 */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    let s = String(v).replace(FW, (c) => FW_MAP[c] || String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    s = s.replace(/[,\s¥￥円]/g, '');
    if (s === '' || s === '-' || s === '.') return 0;
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  /** 3桁区切り（負数対応） */
  function yen(n) {
    n = Math.round(num(n));
    const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s;
  }

  /** 数量など小数ありの表示 */
  function qty(n) {
    const v = num(n);
    if (Number.isInteger(v)) return yen(v);
    return String(Math.round(v * 1000) / 1000);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 改行を <br> にしたエスケープ */
  function escBr(s) {
    return esc(s).replace(/\r?\n/g, '<br>');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n, w) {
    return String(n).padStart(w || 2, '0');
  }

  /** ローカル日付 'YYYY-MM-DD' */
  function ymd(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseYmd(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }

  /** 和暦（令和・平成） */
  function wareki(d) {
    const y = d.getFullYear();
    const t = d.getTime();
    if (t >= new Date(2019, 4, 1).getTime()) {
      const n = y - 2018;
      return '令和' + (n === 1 ? '元' : n) + '年';
    }
    if (t >= new Date(1989, 0, 8).getTime()) {
      const n = y - 1988;
      return '平成' + (n === 1 ? '元' : n) + '年';
    }
    return y + '年';
  }

  /** 'YYYY-MM-DD' → '2026年10月23日'（style='wareki' で和暦） */
  function dateJa(s, style) {
    const d = parseYmd(s);
    if (!d) return s ? String(s) : '';
    const head = style === 'wareki' ? wareki(d) : d.getFullYear() + '年';
    return head + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function addDays(s, days) {
    const d = parseYmd(s) || new Date();
    d.setDate(d.getDate() + days);
    return ymd(d);
  }

  /** n ヶ月後の月末（n=0 で当月末） */
  function endOfMonth(s, n) {
    const d = parseYmd(s) || new Date();
    return ymd(new Date(d.getFullYear(), d.getMonth() + 1 + (n || 0), 0));
  }

  /** 支払期限ルール → 日付 */
  function dueByRule(issue, rule) {
    switch (rule) {
      case 'eom0': return endOfMonth(issue, 0);
      case 'eom1': return endOfMonth(issue, 1);
      case 'eom2': return endOfMonth(issue, 2);
      case 'd30': return addDays(issue, 30);
      case 'd60': return addDays(issue, 60);
      case 'd14': return addDays(issue, 14);
      default: return '';
    }
  }

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  /** パス 'a.b.0.c' で値を取得／設定 */
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      const k = ks[i];
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[k];
    }
    o[ks[ks.length - 1]] = val;
  }

  /** 適格請求書発行事業者の登録番号を正規化（全角→半角、T付与）。不正なら null */
  function normRegNo(v) {
    if (!v) return '';
    let s = String(v).replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    s = s.replace(/[\s-]/g, '').toUpperCase();
    if (/^\d{13}$/.test(s)) s = 'T' + s;
    return /^T\d{13}$/.test(s) ? s : null;
  }

  /** ファイル名に使えない文字を除去 */
  function safeFileName(s) {
    return String(s || '')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  /** CSV（Excel向けに UTF-8 BOM 付き） */
  function toCsv(rows) {
    const body = rows
      .map((r) =>
        r
          .map((c) => {
            const s = c == null ? '' : String(c);
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(',')
      )
      .join('\r\n');
    return '﻿' + body + '\r\n';
  }

  function toast(msg, kind) {
    if (typeof document === 'undefined') return;
    let box = document.querySelector('.hs-toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'hs-toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'hs-toast' + (kind ? ' is-' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('is-out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  HS.util = {
    num, yen, qty, esc, escBr, uid, pad, ymd, parseYmd, wareki, dateJa, addDays, endOfMonth,
    dueByRule, clone, debounce, getPath, setPath, normRegNo, safeFileName, download, toCsv, toast
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- calc.js ---- */
/* ひとり請求書 — 金額計算（インボイス・源泉徴収・収入印紙） */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const { num } = HS.util;

  const RATES = [10, 8, 0];

  /** 浮動小数の誤差を落としてから端数処理（0 方向を基準に対称） */
  function roundBy(x, mode) {
    x = Math.round(x * 1e6) / 1e6;
    const a = Math.abs(x);
    let r;
    if (mode === 'ceil') r = Math.ceil(a);
    else if (mode === 'round') r = Math.round(a);
    else r = Math.floor(a);
    return x < 0 ? -r : r;
  }

  function normRate(r) {
    r = Number(r);
    return r === 10 || r === 8 ? r : 0;
  }

  function isBlankItem(it) {
    return !it || (!String(it.name || '').trim() && !num(it.price));
  }

  function lineAmount(it, mode) {
    const q = it.qty === '' || it.qty == null ? 1 : num(it.qty);
    return roundBy(q * num(it.price), mode);
  }

  /**
   * 源泉徴収税額（所得税・復興特別所得税［2027年〜は防衛特別所得税を含む］）
   * 100万円以下: 10.21% / 100万円超: (超過分 × 20.42%) + 102,100円。1円未満切り捨て
   */
  function withholdingTax(base) {
    base = Math.floor(num(base));
    if (base <= 0) return 0;
    if (base <= 1000000) return Math.floor((base * 1021) / 10000);
    return Math.floor(((base - 1000000) * 2042) / 10000) + 102100;
  }

  /** 領収書（第17号の1文書）の印紙税額。amount は消費税額を除いた受取金額 */
  const STAMP_TABLE = [
    [1000000, 200], [2000000, 400], [3000000, 600], [5000000, 1000], [10000000, 2000],
    [20000000, 4000], [30000000, 6000], [50000000, 10000], [100000000, 20000],
    [200000000, 40000], [300000000, 60000], [500000000, 100000], [1000000000, 150000]
  ];
  function stampDuty(amount) {
    amount = Math.floor(num(amount));
    if (amount < 50000) return 0;
    for (const [lim, fee] of STAMP_TABLE) if (amount <= lim) return fee;
    return 200000;
  }

  /**
   * 書類の合計を計算。端数処理は「1つの書類につき税率ごとに1回」（インボイス制度のルール）
   * doc.calc: { taxMode: 'exclusive'|'inclusive', rounding: 'floor'|'round'|'ceil', withholding: bool, whBase: 'net'|'gross' }
   */
  function totals(doc) {
    const c = (doc && doc.calc) || {};
    const mode = c.rounding || 'floor';
    const inclusive = c.taxMode === 'inclusive';
    const wh = !!c.withholding;
    const whGross = c.whBase === 'gross';

    const acc = {};
    RATES.forEach((r) => (acc[r] = { amount: 0, wh: 0, count: 0 }));

    const lines = ((doc && doc.items) || []).map((it) => {
      if (isBlankItem(it)) return { blank: true, amount: 0, rate: normRate(it && it.rate) };
      const rate = normRate(it.rate);
      const amount = lineAmount(it, mode);
      acc[rate].amount += amount;
      acc[rate].count++;
      if (wh && it.wh !== false) acc[rate].wh += amount;
      return { blank: false, amount, rate };
    });

    const rates = {};
    let net = 0, tax = 0, gross = 0, whBase = 0;
    RATES.forEach((r) => {
      const a = acc[r];
      let n, t, gr;
      if (r === 0) {
        n = gr = a.amount;
        t = 0;
      } else if (inclusive) {
        gr = a.amount;
        t = roundBy((gr * r) / (100 + r), mode);
        n = gr - t;
      } else {
        n = a.amount;
        t = roundBy((n * r) / 100, mode);
        gr = n + t;
      }
      rates[r] = { net: n, tax: t, gross: gr, used: a.count > 0 };
      net += n;
      tax += t;
      gross += gr;

      if (wh && a.wh) {
        let wn, wg;
        if (r === 0) {
          wn = wg = a.wh;
        } else if (inclusive) {
          wg = a.wh;
          wn = wg - roundBy((wg * r) / (100 + r), mode);
        } else {
          wn = a.wh;
          wg = wn + roundBy((wn * r) / 100, mode);
        }
        whBase += whGross ? wg : wn;
      }
    });

    const whTax = wh ? withholdingTax(whBase) : 0;
    const payable = gross - whTax;
    // 領収書の印紙判定額：受取金額から区分記載された消費税額を除く
    const stampBase = Math.max(0, payable - tax);
    return {
      lines, rates, net, tax, gross, whBase, whTax, payable,
      stampBase, stamp: stampDuty(stampBase),
      hasReduced: rates[8].used,
      itemCount: lines.filter((l) => !l.blank).length
    };
  }

  /** 報酬（税抜）→ 振込額。taxRate: 10 or 0, whOnGross: 源泉を税込で計算 */
  function payout(base, taxRate, whOnGross) {
    base = Math.floor(num(base));
    const tax = taxRate ? Math.floor((base * taxRate) / 100) : 0;
    const wh = withholdingTax(whOnGross ? base + tax : base);
    return { base, tax, gross: base + tax, wh, net: base + tax - wh };
  }

  /** 振込額（手取り）から報酬（税抜）を逆算。完全一致がなければ「以上」で最小のもの */
  function payoutReverse(target, taxRate, whOnGross) {
    target = Math.floor(num(target));
    if (target <= 0) return payout(0, taxRate, whOnGross);
    let lo = 0, hi = Math.ceil(target * 1.5) + 10;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (payout(mid, taxRate, whOnGross).net >= target) hi = mid;
      else lo = mid + 1;
    }
    for (let b = Math.max(0, lo - 3); b <= lo + 3; b++) {
      if (payout(b, taxRate, whOnGross).net === target) return payout(b, taxRate, whOnGross);
    }
    return payout(lo, taxRate, whOnGross);
  }

  HS.calc = { RATES, roundBy, normRate, isBlankItem, lineAmount, withholdingTax, stampDuty, totals, payout, payoutReverse };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- ctax.js ---- */
/* ひとり請求書 — 消費税の納税額シミュレーション（個人事業者）
 * 根拠: 国税庁「インボイス制度に関する令和8年度税制改正について」（令和8年4月・5月改訂）
 *  - 2割特例: 令和8年9月30日を含む課税期間まで（個人は令和8年分まで）
 *  - 3割特例: 個人事業者の令和9年分・令和10年分（売上税額×7割を控除＝納付は3割）
 *  - 免税事業者等からの仕入れの経過措置: R8.10〜70% / R10.10〜50% / R12.10〜30% / R13.10〜0%
 */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const { num } = HS.util;

  const SIMPLE = {
    1: { rate: 0.9, label: '第1種事業（卸売業）', ex: '仕入れた商品を事業者に販売' },
    2: { rate: 0.8, label: '第2種事業（小売業など）', ex: '仕入れた商品を消費者に販売、農林漁業のうち飲食料品の譲渡' },
    3: { rate: 0.7, label: '第3種事業（製造業・建設業など）', ex: '製造、建設、農林漁業（飲食料品以外）' },
    4: { rate: 0.6, label: '第4種事業（飲食店業など）', ex: '飲食店、第1〜3・5・6種以外' },
    5: { rate: 0.5, label: '第5種事業（サービス業など）', ex: 'デザイン、システム開発、ライター、コンサル、運輸通信、金融保険' },
    6: { rate: 0.4, label: '第6種事業（不動産業）', ex: '不動産の仲介・賃貸など' }
  };

  const at = (y, m) => y * 12 + (m - 1);

  /** 免税事業者等（インボイスなし）からの仕入れの控除割合（その月） */
  function nonQualifiedRatioAt(y, m) {
    const t = at(y, m);
    if (t < at(2023, 10)) return 1;
    if (t < at(2026, 10)) return 0.8;
    if (t < at(2028, 10)) return 0.7;
    if (t < at(2030, 10)) return 0.5;
    if (t < at(2031, 10)) return 0.3;
    return 0;
  }

  /** 暦年平均（仕入れが毎月均等と仮定） */
  function nonQualifiedRatioYear(y) {
    let s = 0;
    for (let m = 1; m <= 12; m++) s += nonQualifiedRatioAt(y, m);
    return Math.round((s / 12) * 10000) / 10000;
  }

  /** 個人事業者がその年分で使える小規模事業者向け特例 */
  function specialRule(year) {
    if (year >= 2023 && year <= 2026) return { key: 'tokurei2', label: '2割特例', deduct: 0.8, pay: 0.2 };
    if (year === 2027 || year === 2028) return { key: 'tokurei3', label: '3割特例', deduct: 0.7, pay: 0.3 };
    return null;
  }

  const floorTo = (x, unit) => Math.floor(x / unit) * unit;

  /** 控除税額から納付税額（国税＋地方）を出す */
  function settle(outputTax, deduct) {
    const diff = outputTax - deduct;
    if (diff >= 0) {
      const national = floorTo(diff, 100);
      const local = floorTo((national * 22) / 78, 100);
      return { deduct, national, local, total: national + local, refund: false };
    }
    const national = diff; // 控除不足還付税額（100円未満の切り捨てなし）
    const local = -Math.floor((-diff * 22) / 78);
    return { deduct, national, local, total: national + local, refund: true };
  }

  /**
   * input: {
   *   year, salesInclusive(bool),
   *   sales10, sales8,                  // 課税売上（年額）
   *   purchases10, purchases8,          // 課税仕入れ・経費（税込）
   *   nonQualified10,                   // うちインボイスのない10%仕入れ（税込）
   *   business: 1..6,                   // 簡易課税の事業区分
   *   converted(bool),                  // 免税事業者がインボイス登録で課税事業者になった
   *   base10m(bool),                    // 基準期間（2年前）の課税売上高 1,000万円以下
   *   base50m(bool)                     // 基準期間の課税売上高 5,000万円以下（簡易課税の要件）
   * }
   */
  function compute(input) {
    const year = Number(input.year) || 2027;
    const incl = !!input.salesInclusive;
    const s10 = Math.max(0, num(input.sales10));
    const s8 = Math.max(0, num(input.sales8));

    const base10 = floorTo(incl ? (s10 * 100) / 110 : s10, 1000);
    const base8 = floorTo(incl ? (s8 * 100) / 108 : s8, 1000);
    const out10 = Math.floor((base10 * 78) / 1000);
    const out8 = Math.floor((base8 * 624) / 10000);
    const outputTax = out10 + out8;
    const netSales = (incl ? Math.floor((s10 * 100) / 110) + Math.floor((s8 * 100) / 108) : s10 + s8);

    const p10 = Math.max(0, num(input.purchases10));
    const p8 = Math.max(0, num(input.purchases8));
    const nq10 = Math.min(Math.max(0, num(input.nonQualified10)), p10);
    const ratio = nonQualifiedRatioYear(year);
    const standardDeduct = Math.floor(((p10 - nq10) * 7.8) / 110 + ((nq10 * 7.8) / 110) * ratio + (p8 * 6.24) / 108);

    const biz = SIMPLE[input.business] ? Number(input.business) : 5;
    const sp = specialRule(year);
    const converted = input.converted !== false;
    const base10m = input.base10m !== false;
    const base50m = input.base50m !== false;

    const methods = [];
    if (sp) {
      const ok = converted && base10m;
      methods.push(Object.assign(
        { key: sp.key, label: sp.label, eligible: ok, note: ok ? '届出不要。確定申告書に適用する旨を付記' : '対象外（インボイス登録で課税事業者になった方、かつ2年前の課税売上高1,000万円以下が条件）' },
        settle(outputTax, Math.floor(outputTax * sp.deduct))
      ));
    }
    methods.push(Object.assign(
      { key: 'simple', label: '簡易課税', eligible: base50m, note: base50m ? 'みなし仕入率 ' + SIMPLE[biz].rate * 100 + '%（' + SIMPLE[biz].label + '）。事前の届出が必要' : '対象外（2年前の課税売上高が5,000万円超）' },
      settle(outputTax, Math.floor(outputTax * SIMPLE[biz].rate))
    ));
    methods.push(Object.assign(
      { key: 'standard', label: '本則課税（原則）', eligible: true, note: '実際の経費の消費税を控除。インボイスの保存が必要' },
      settle(outputTax, standardDeduct)
    ));

    const eligible = methods.filter((m) => m.eligible);
    const best = eligible.reduce((a, b) => (b.total < a.total ? b : a), eligible[0]);
    methods.forEach((m) => {
      m.best = m === best;
      m.rate = netSales > 0 ? m.total / netSales : 0;
    });

    return { year, base10, base8, outputTax, netSales, nonQualifiedRatio: ratio, business: biz, methods, best };
  }

  /** 同じ売上・経費が続くと仮定した年別の最小納税額 */
  function projection(input, years) {
    years = years || [2026, 2027, 2028, 2029, 2030];
    return years.map((y) => {
      const r = compute(Object.assign({}, input, { year: y }));
      return { year: y, best: r.best, methods: r.methods };
    });
  }

  HS.ctax = { SIMPLE, nonQualifiedRatioAt, nonQualifiedRatioYear, specialRule, compute, projection };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- model.js ---- */
/* ひとり請求書 — データモデル・保存 */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const U = HS.util;

  const TYPES = {
    estimate: {
      label: '見積書', short: '見積', prefix: 'Q', numLabel: '見積番号', dateLabel: '見積日',
      lead: '下記のとおりお見積り申し上げます。', totalLabel: 'お見積金額'
    },
    delivery: {
      label: '納品書', short: '納品', prefix: 'D', numLabel: '納品書番号', dateLabel: '納品日',
      lead: '下記のとおり納品いたしました。', totalLabel: '合計金額'
    },
    invoice: {
      label: '請求書', short: '請求', prefix: 'INV', numLabel: '請求書番号', dateLabel: '請求日',
      lead: '下記のとおりご請求申し上げます。', totalLabel: 'ご請求金額'
    },
    receipt: {
      label: '領収書', short: '領収', prefix: 'R', numLabel: '領収書番号', dateLabel: '発行日',
      lead: '上記正に領収いたしました。', totalLabel: '領収金額'
    }
  };
  const TYPE_ORDER = ['estimate', 'delivery', 'invoice', 'receipt'];

  function defaultProfile() {
    return {
      name: '', person: '', regNo: '', zip: '', address: '', tel: '', email: '',
      bank: { name: '', branch: '', kind: '普通', number: '', holder: '' },
      seal: { mode: 'none', text: '', style: 'round', image: '' },
      logo: '',
      design: { template: 'standard', font: 'gothic', color: '#1f4ea3', dateStyle: 'west' },
      defaults: {
        taxMode: 'exclusive', rounding: 'floor', withholding: false, whBase: 'net', dueRule: 'eom1',
        notes: { estimate: '', delivery: '', invoice: 'お振込手数料は貴社にてご負担くださいますようお願いいたします。', receipt: '' }
      },
      numbering: {
        estimate: { format: 'Q-{YYYY}-{SEQ}', pad: 3, reset: 'yearly' },
        delivery: { format: 'D-{YYYY}-{SEQ}', pad: 3, reset: 'yearly' },
        invoice: { format: 'INV-{YYYY}-{SEQ}', pad: 3, reset: 'yearly' },
        receipt: { format: 'R-{YYYY}-{SEQ}', pad: 3, reset: 'yearly' }
      }
    };
  }

  /** 古いデータに不足キーを補う */
  function mergeDefaults(def, obj) {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return obj == null ? def : obj;
    const out = Array.isArray(def) ? [] : {};
    Object.keys(def).forEach((k) => {
      const dv = def[k];
      out[k] = dv && typeof dv === 'object' && !Array.isArray(dv) ? mergeDefaults(dv, obj[k]) : obj[k] === undefined ? dv : obj[k];
    });
    Object.keys(obj).forEach((k) => {
      if (!(k in out)) out[k] = obj[k];
    });
    return out;
  }

  function newItem(rate) {
    return { name: '', qty: 1, unit: '', price: '', rate: rate == null ? 10 : rate, wh: true };
  }

  function newDoc(type, profile) {
    const p = profile || defaultProfile();
    const today = U.ymd();
    const d = p.defaults || {};
    const doc = {
      id: U.uid(),
      type: TYPES[type] ? type : 'invoice',
      number: '',
      issueDate: today,
      txDate: '',
      dueDate: '',
      validUntil: '',
      subject: '',
      client: { name: '', honor: '御中', dept: '', person: '', zip: '', address: '' },
      clientId: '',
      items: [newItem(), newItem()],
      calc: { taxMode: d.taxMode || 'exclusive', rounding: d.rounding || 'floor', withholding: !!d.withholding, whBase: d.whBase || 'net' },
      notes: (d.notes && d.notes[type]) || '',
      showBank: true,
      receipt: { purpose: '', method: '銀行振込', paper: false },
      status: 'draft',
      paidAt: '',
      fromId: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    applyTypeDefaults(doc, p);
    return doc;
  }

  /** 書類の種類に応じた日付などの初期値 */
  function applyTypeDefaults(doc, profile) {
    const d = (profile && profile.defaults) || {};
    if (doc.type === 'invoice' && !doc.dueDate) doc.dueDate = U.dueByRule(doc.issueDate, d.dueRule || 'eom1');
    if (doc.type === 'estimate' && !doc.validUntil) doc.validUntil = U.addDays(doc.issueDate, 30);
  }

  /** 書類を別の種類に変換（見積→納品→請求→領収） */
  function convertDoc(src, toType, profile) {
    const doc = U.clone(src);
    doc.id = U.uid();
    doc.fromId = src.id;
    doc.type = toType;
    doc.number = '';
    doc.issueDate = U.ymd();
    doc.dueDate = '';
    doc.validUntil = '';
    doc.status = 'draft';
    doc.paidAt = '';
    doc.createdAt = doc.updatedAt = Date.now();
    delete doc.issuer;
    const notes = profile && profile.defaults && profile.defaults.notes;
    if (notes && notes[toType] != null && (!src.notes || src.notes === (notes[src.type] || ''))) doc.notes = notes[toType];
    if (toType === 'receipt' && !doc.receipt.purpose) doc.receipt.purpose = doc.subject ? doc.subject + '代として' : '';
    applyTypeDefaults(doc, profile);
    return doc;
  }

  /** 宛名から敬称を推測 */
  function guessHonor(name) {
    if (!name) return '御中';
    return /(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団|公益社団|一般財団|公益財団|社団法人|財団法人|学校法人|医療法人|NPO|特定非営利|協同組合|組合|事務所|商店|（株）|\(株\)|㈱|（有）|\(有\)|㈲|部$|課$|室$|係$|Inc|LLC|Co\.|Ltd|会社)/i.test(name) ? '御中' : '様';
  }

  /** 採番：format の {YYYY}{YY}{MM}{DD}{SEQ} を置換 */
  function formatNumber(rule, dateStr, seq) {
    const d = U.parseYmd(dateStr) || new Date();
    const s = String(seq).padStart(rule.pad || 3, '0');
    return String(rule.format || '{YYYY}-{SEQ}')
      .replace(/\{YYYY\}/g, d.getFullYear())
      .replace(/\{YY\}/g, String(d.getFullYear()).slice(2))
      .replace(/\{MM\}/g, U.pad(d.getMonth() + 1))
      .replace(/\{DD\}/g, U.pad(d.getDate()))
      .replace(/\{SEQ\}/g, s);
  }

  function seqKey(rule, dateStr) {
    const d = U.parseYmd(dateStr) || new Date();
    if (rule.reset === 'monthly') return d.getFullYear() + '-' + U.pad(d.getMonth() + 1);
    if (rule.reset === 'yearly') return String(d.getFullYear());
    return 'all';
  }

  /** 推奨ファイル名（電子帳簿保存法の検索要件：日付・取引先・金額） */
  function fileName(doc, totals) {
    const t = TYPES[doc.type] || TYPES.invoice;
    const date = (doc.issueDate || U.ymd()).replace(/-/g, '');
    const amount = doc.type === 'receipt' || doc.type === 'invoice' ? totals.payable : totals.gross;
    const parts = [date, U.safeFileName(doc.client && doc.client.name) || '宛先なし', t.label, amount + '円'];
    if (doc.number) parts.push(U.safeFileName(doc.number));
    return parts.join('_');
  }

  function sampleProfile() {
    const p = defaultProfile();
    Object.assign(p, {
      name: '山田デザイン事務所', person: '山田 太郎', regNo: 'T1234567890123', zip: '150-0001',
      address: '東京都渋谷区神宮前1-2-3 サンプルビル4F', tel: '03-1234-5678', email: 'info@example.com'
    });
    p.bank = { name: 'みらい銀行', branch: '渋谷支店', kind: '普通', number: '1234567', holder: 'ヤマダ タロウ' };
    p.seal = { mode: 'auto', text: '山田', style: 'round', image: '' };
    return p;
  }

  function sampleDoc(type, profile) {
    const doc = newDoc(type || 'invoice', profile);
    doc.number = TYPES[doc.type].prefix + '-' + new Date().getFullYear() + '-001';
    doc.subject = 'コーポレートサイト リニューアル';
    const now = new Date();
    doc.txDate = now.getFullYear() + '年' + (now.getMonth() + 1) + '月分';
    doc.client = { name: '株式会社サンプル商事', honor: '御中', dept: '広報部', person: '佐藤様', zip: '100-0005', address: '東京都千代田区丸の内1-1-1' };
    doc.items = [
      { name: 'Webサイト デザイン（トップ＋下層5ページ）', qty: 1, unit: '式', price: 300000, rate: 10, wh: true },
      { name: 'コーディング・CMS組み込み', qty: 1, unit: '式', price: 180000, rate: 10, wh: true },
      { name: '撮影用 お弁当（打ち合わせ時）', qty: 4, unit: '個', price: 1000, rate: 8, wh: true },
      { name: '保守サポート（' + (now.getMonth() + 1) + '月分）', qty: 1, unit: '月', price: 20000, rate: 10, wh: true }
    ];
    doc.receipt.purpose = 'コーポレートサイト制作費として';
    return doc;
  }

  HS.model = {
    TYPES, TYPE_ORDER, defaultProfile, mergeDefaults, newItem, newDoc, applyTypeDefaults, convertDoc,
    guessHonor, formatNumber, seqKey, fileName, sampleProfile, sampleDoc
  };

  // ---- localStorage ----
  const PREFIX = 'hs1:';
  function lsGet(key, fallback) {
    try {
      const v = g.localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function lsSet(key, val) {
    try {
      g.localStorage.setItem(PREFIX + key, JSON.stringify(val));
      return true;
    } catch (e) {
      U.toast('ブラウザの保存容量がいっぱいです。不要な書類を削除するか、ロゴ・印影画像を小さくしてください。', 'error');
      return false;
    }
  }
  function lsRemove(key) {
    try {
      g.localStorage.removeItem(PREFIX + key);
    } catch (e) { /* noop */ }
  }
  function lsKeys() {
    const out = [];
    try {
      for (let i = 0; i < g.localStorage.length; i++) {
        const k = g.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
    } catch (e) { /* noop */ }
    return out;
  }
  function lsUsage() {
    let bytes = 0;
    try {
      lsKeys().forEach((k) => (bytes += (k.length + (g.localStorage.getItem(PREFIX + k) || '').length) * 2));
    } catch (e) { /* noop */ }
    return bytes;
  }

  HS.store = { get: lsGet, set: lsSet, remove: lsRemove, keys: lsKeys, usage: lsUsage };

  HS.profile = {
    load() {
      return mergeDefaults(defaultProfile(), lsGet('profile', null) || {});
    },
    save(p) {
      return lsSet('profile', p);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- seal.js ---- */
/* ひとり請求書 — 電子印影（SVG生成・画像の背景透過） */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const { esc } = HS.util;

  const RED = '#d0212d';
  const FONT = "'BIZ UDPMincho','Yu Mincho','YuMincho','Hiragino Mincho ProN','Hiragino Mincho Pro','Noto Serif JP','MS PMincho','MS Mincho',serif";

  function chars(text) {
    return Array.from(String(text || '').replace(/\s+/g, '')).slice(0, 12);
  }

  function t(ch, x, y, size) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" text-anchor="middle" dominant-baseline="central">' + esc(ch) + '</text>';
  }

  /** 丸印：縦書き。4文字以上は右列から2列に */
  function round(cs) {
    let body = '';
    const n = cs.length;
    if (n === 1) body = t(cs[0], 50, 52, 54);
    else if (n === 2) body = t(cs[0], 50, 31, 37) + t(cs[1], 50, 69, 37);
    else if (n === 3) body = cs.map((c, i) => t(c, 50, 25 + i * 25, 26)).join('');
    else {
      const rows = Math.ceil(n / 2);
      const size = rows <= 2 ? 30 : rows === 3 ? 23 : 18;
      const step = rows <= 2 ? 30 : rows === 3 ? 24 : 19;
      const top = 50 - ((rows - 1) * step) / 2;
      cs.forEach((c, i) => {
        const col = i < rows ? 0 : 1; // 右列が先
        const row = i % rows;
        body += t(c, col === 0 ? 63 : 37, top + row * step, size);
      });
    }
    return '<circle cx="50" cy="50" r="45.5" fill="none" stroke="' + RED + '" stroke-width="4.2"/>' + body;
  }

  /** 角印：右の列から縦に読むグリッド */
  function square(cs) {
    const n = cs.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const inner = 80;
    const cell = inner / Math.max(rows, cols);
    const size = cell * 0.9;
    const offX = 50 + (cols * cell) / 2 - cell / 2; // 右端の列の中心
    const offY = 50 - (rows * cell) / 2 + cell / 2;
    let body = '';
    cs.forEach((c, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      body += t(c, offX - col * cell, offY + row * cell, size.toFixed(1));
    });
    return '<rect x="4.5" y="4.5" width="91" height="91" rx="3" fill="none" stroke="' + RED + '" stroke-width="4.2"/>' + body;
  }

  /** seal: {mode, text, style, image}, fallbackName: 発行者名 */
  function sealHtml(seal, fallbackName) {
    if (!seal || seal.mode === 'none') return '';
    if (seal.mode === 'image' && seal.image) return '<img class="doc-seal-img" src="' + seal.image + '" alt="印">';
    if (seal.mode !== 'auto') return '';
    const cs = chars(seal.text || fallbackName);
    if (!cs.length) return '';
    const inner = seal.style === 'square' ? square(cs) : round(cs);
    return (
      '<svg class="doc-seal-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="印影">' +
      '<g fill="' + RED + '" font-family="' + FONT + '" font-weight="700">' + inner + '</g></svg>'
    );
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('画像を読み込めませんでした'));
        img.src = fr.result;
      };
      fr.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
      fr.readAsDataURL(file);
    });
  }

  function fit(w, h, maxW, maxH) {
    const r = Math.min(1, maxW / w, maxH / h);
    return [Math.max(1, Math.round(w * r)), Math.max(1, Math.round(h * r))];
  }

  /** 印鑑の写真・スキャン画像 → 白背景を透過してトリミングした PNG */
  async function processSealImage(file) {
    const img = await loadImage(file);
    const [w, h] = fit(img.naturalWidth || img.width, img.naturalHeight || img.height, 360, 360);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h);
    const p = data.data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = p[i], gg = p[i + 1], b = p[i + 2];
        const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
        const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
        if (lum > 205 && sat < 40) {
          p[i + 3] = 0;
        } else if (p[i + 3] > 0) {
          if (lum > 170 && sat < 40) p[i + 3] = Math.round(p[i + 3] * ((205 - lum) / 35));
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    cx.putImageData(data, 0, 0);
    if (maxX < 0) throw new Error('印影が見つかりませんでした。白い紙に押した印影を撮影してください。');
    const m = 2;
    minX = Math.max(0, minX - m);
    minY = Math.max(0, minY - m);
    maxX = Math.min(w - 1, maxX + m);
    maxY = Math.min(h - 1, maxY + m);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  /** ロゴ画像を縮小して data URL に */
  async function processLogo(file) {
    const img = await loadImage(file);
    const [w, h] = fit(img.naturalWidth || img.width || 600, img.naturalHeight || img.height || 200, 720, 240);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d');
    const keepAlpha = /png|svg|gif|webp/.test(file.type);
    if (!keepAlpha) {
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, w, h);
    }
    cx.drawImage(img, 0, 0, w, h);
    return keepAlpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
  }

  HS.seal = { sealHtml, processSealImage, processLogo };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- render.js ---- */
/* ひとり請求書 — 書類（A4）のHTML生成 */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const U = HS.util;
  const { esc, escBr, yen } = U;

  const RATE_LABEL = { 10: '10%対象', 8: '8%対象（軽減税率）※', 0: '非課税・不課税' };

  function fromBlock(p, sealHtml) {
    const lines = [];
    if (p.zip || p.address) lines.push('<div class="doc-from-addr">' + (p.zip ? '〒' + esc(p.zip) + '<br>' : '') + escBr(p.address) + '</div>');
    const contact = [p.tel ? 'TEL ' + esc(p.tel) : '', p.email ? esc(p.email) : ''].filter(Boolean);
    if (contact.length) lines.push('<div class="doc-from-contact">' + contact.join('<br>') + '</div>');
    const reg = U.normRegNo(p.regNo);
    if (p.regNo) lines.push('<div class="doc-regno">登録番号：' + esc(reg || p.regNo) + '</div>');
    return (
      '<div class="doc-from">' +
      (p.logo ? '<img class="doc-logo" src="' + p.logo + '" alt="">' : '') +
      '<div class="doc-from-main">' +
      '<div class="doc-from-name">' + (esc(p.name) || '<span class="doc-ph">（発行者名）</span>') + '</div>' +
      (p.person && p.person !== p.name ? '<div class="doc-from-person">' + esc(p.person) + '</div>' : '') +
      (sealHtml ? '<div class="doc-seal">' + sealHtml + '</div>' : '') +
      '</div>' +
      lines.join('') +
      '</div>'
    );
  }

  function clientBlock(c, extraClass) {
    const sub = [];
    if (c.zip || c.address) sub.push((c.zip ? '〒' + esc(c.zip) + ' ' : '') + escBr(c.address));
    const dp = [c.dept, c.person].filter(Boolean).map(esc).join(' ');
    if (dp) sub.push(dp);
    return (
      '<div class="doc-client ' + (extraClass || '') + '">' +
      '<div class="doc-client-line"><span class="doc-client-name">' + (esc(c.name) || '<span class="doc-ph">（宛先）</span>') + '</span>' +
      (c.honor ? '<span class="doc-honor">' + esc(c.honor) + '</span>' : '') + '</div>' +
      (sub.length ? '<div class="doc-client-sub">' + sub.join('<br>') + '</div>' : '') +
      '</div>'
    );
  }

  function itemsTable(doc, tot, minRows) {
    const mixed = tot.rates[8].used || tot.rates[0].used;
    const inclusive = doc.calc.taxMode === 'inclusive';
    const rows = [];
    (doc.items || []).forEach((it, i) => {
      const l = tot.lines[i];
      if (!l || l.blank) return;
      const rateCell = l.rate === 8 ? '8%※' : l.rate === 0 ? '−' : '10%';
      rows.push(
        '<tr>' +
        '<td class="c-name">' + escBr(it.name) + '</td>' +
        '<td class="c-qty">' + U.qty(it.qty === '' || it.qty == null ? 1 : it.qty) + '</td>' +
        '<td class="c-unit">' + esc(it.unit) + '</td>' +
        '<td class="c-price">' + yen(it.price) + '</td>' +
        (mixed ? '<td class="c-rate">' + rateCell + '</td>' : '') +
        '<td class="c-amt">' + yen(l.amount) + '</td>' +
        '</tr>'
      );
    });
    const cols = mixed ? 6 : 5;
    for (let i = rows.length; i < (minRows || 0); i++) rows.push('<tr class="is-empty">' + '<td>&nbsp;</td>'.repeat(cols) + '</tr>');
    return (
      '<table class="doc-items"><thead><tr>' +
      '<th class="c-name">品目・内容</th><th class="c-qty">数量</th><th class="c-unit">単位</th><th class="c-price">単価</th>' +
      (mixed ? '<th class="c-rate">税率</th>' : '') +
      '<th class="c-amt">金額' + (inclusive ? '（税込）' : '') + '</th>' +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'
    );
  }

  function breakdown(doc, tot) {
    const inclusive = doc.calc.taxMode === 'inclusive';
    const rs = [10, 8, 0].filter((r) => tot.rates[r].used);
    if (!rs.length) rs.push(10);
    const rows = rs
      .map((r) => {
        const x = tot.rates[r];
        return '<tr><th>' + RATE_LABEL[r] + '</th><td>' + yen(inclusive ? x.gross : x.net) + '</td><td>' + (r === 0 ? '−' : yen(x.tax)) + '</td></tr>';
      })
      .join('');
    return (
      '<table class="doc-breakdown"><caption>税率別内訳</caption><thead><tr><th></th><th>' +
      (inclusive ? '対象金額（税込）' : '対象金額（税抜）') + '</th><th>' + (inclusive ? 'うち消費税' : '消費税') +
      '</th></tr></thead><tbody>' + rows + '</tbody></table>'
    );
  }

  function sums(doc, tot, t) {
    const inclusive = doc.calc.taxMode === 'inclusive';
    const r = [];
    if (!inclusive) {
      r.push(['小計（税抜）', yen(tot.net)]);
      if (tot.rates[10].used || (!tot.rates[8].used && !tot.rates[0].used)) r.push(['消費税（10%）', yen(tot.rates[10].tax)]);
      if (tot.rates[8].used) r.push(['消費税（8%）', yen(tot.rates[8].tax)]);
      r.push(['合計（税込）', yen(tot.gross), tot.whTax ? '' : 'is-total']);
    } else {
      r.push(['合計（税込）', yen(tot.gross), tot.whTax ? '' : 'is-total']);
      if (tot.rates[10].used) r.push(['（内消費税 10%）', yen(tot.rates[10].tax)]);
      if (tot.rates[8].used) r.push(['（内消費税 8%）', yen(tot.rates[8].tax)]);
    }
    if (tot.whTax) {
      r.push(['源泉徴収税額', '−' + yen(tot.whTax)]);
      r.push([t.type === 'receipt' ? '差引領収額' : t.type === 'invoice' ? '差引ご請求額' : '差引金額', yen(tot.payable), 'is-total']);
    }
    return '<table class="doc-sums"><tbody>' + r.map((x) => '<tr class="' + (x[2] || '') + '"><th>' + x[0] + '</th><td>' + x[1] + '</td></tr>').join('') + '</tbody></table>';
  }

  function bankBlock(p) {
    const b = p.bank || {};
    if (!b.name && !b.number) return '';
    const parts = [b.name, b.branch, b.kind, b.number].filter(Boolean).map(esc).join(' ');
    return '<div class="doc-bank"><div class="doc-label">お振込先</div><div>' + parts + (b.holder ? '<br>口座名義：' + esc(b.holder) : '') + '</div></div>';
  }

  function metaList(pairs) {
    return '<dl class="doc-meta">' + pairs.filter((p) => p[1]).map((p) => '<div><dt>' + p[0] + '</dt><dd>' + p[1] + '</dd></div>').join('') + '</dl>';
  }

  /**
   * doc: 書類、issuer: 発行者情報（profile または履歴のスナップショット）
   * opts: { watermark: '体験版' など }
   */
  function render(doc, issuer, opts) {
    opts = opts || {};
    const p = issuer || HS.model.defaultProfile();
    const design = p.design || {};
    const T = HS.model.TYPES[doc.type] || HS.model.TYPES.invoice;
    const tot = HS.calc.totals(doc);
    const ds = design.dateStyle;
    const fd = (s) => U.dateJa(s, ds);
    const seal = HS.seal.sealHtml(p.seal, p.person || p.name);
    const cls = 'doc t-' + (design.template || 'standard') + ' f-' + (design.font || 'gothic') + ' type-' + doc.type;
    const style = '--doc-accent:' + (design.color || '#1f4ea3');
    const wm = opts.watermark ? '<div class="doc-watermark" aria-hidden="true">' + esc(opts.watermark) + '</div>' : '';
    const foot = [];
    if (tot.hasReduced) foot.push('※は軽減税率（8%）対象品目です。');

    if (doc.type === 'receipt') {
      const r = doc.receipt || {};
      const showItems = tot.itemCount > 1;
      const stampBox = r.paper && tot.stamp > 0
        ? '<div class="rc-stamp"><span>収入印紙</span><small>' + yen(tot.stamp) + '円</small></div>'
        : '';
      const rows = [10, 8, 0]
        .filter((x) => tot.rates[x].used)
        .map((x) => {
          const v = tot.rates[x];
          return '<tr><th>' + RATE_LABEL[x] + '</th><td>税抜 ' + yen(v.net) + '円</td><td>' + (x === 0 ? '' : '消費税 ' + yen(v.tax) + '円') + '</td></tr>';
        })
        .join('');
      return (
        '<div class="' + cls + '" style="' + style + '">' + wm +
        '<header class="doc-head"><h1 class="doc-title">' + T.label + '</h1>' +
        metaList([[T.numLabel, esc(doc.number)], [T.dateLabel, fd(doc.issueDate)]]) + '</header>' +
        clientBlock(doc.client || {}, 'rc-client') +
        '<div class="rc-amount"><span class="rc-amount-label">金額</span><span class="rc-amount-value">¥' + yen(tot.payable) + '<span class="rc-dash">-</span></span><span class="rc-amount-note">（税込）</span></div>' +
        '<div class="rc-purpose"><span class="doc-label">但し</span><span>' + (esc(r.purpose) || '<span class="doc-ph">お品代として</span>') + '</span></div>' +
        '<p class="rc-lead">' + T.lead + '</p>' +
        '<div class="rc-grid"><div class="rc-left">' +
        '<table class="rc-breakdown"><caption>内訳</caption><tbody>' + rows +
        (tot.whTax ? '<tr><th>源泉徴収税額</th><td colspan="2">' + yen(tot.whTax) + '円（税込合計 ' + yen(tot.gross) + '円より差引）</td></tr>' : '') +
        (r.method ? '<tr><th>お支払方法</th><td colspan="2">' + esc(r.method) + '</td></tr>' : '') +
        '</tbody></table>' + stampBox +
        '</div>' + fromBlock(p, seal) + '</div>' +
        (showItems ? itemsTable(doc, tot, 0) : '') +
        (doc.notes ? '<div class="doc-notes"><div class="doc-label">備考</div><div>' + escBr(doc.notes) + '</div></div>' : '') +
        (foot.length ? '<p class="doc-foot">' + foot.join('<br>') + '</p>' : '') +
        '</div>'
      );
    }

    const totalLabel = T.totalLabel;
    const keyDates = [];
    if (doc.type === 'invoice' && doc.dueDate) keyDates.push(['お支払期限', fd(doc.dueDate)]);
    if (doc.type === 'estimate' && doc.validUntil) keyDates.push(['有効期限', fd(doc.validUntil)]);
    if (doc.txDate) keyDates.push([doc.type === 'estimate' ? '納期・期間' : '取引年月日', esc(doc.txDate)]);

    return (
      '<div class="' + cls + '" style="' + style + '">' + wm +
      '<header class="doc-head"><h1 class="doc-title">' + T.label + '</h1>' +
      metaList([[T.numLabel, esc(doc.number)], [T.dateLabel, fd(doc.issueDate)]]) + '</header>' +
      '<section class="doc-parties"><div class="doc-to">' +
      clientBlock(doc.client || {}) +
      (doc.subject ? '<div class="doc-subject"><span class="doc-label">件名</span><span>' + esc(doc.subject) + '</span></div>' : '') +
      '<p class="doc-lead">' + T.lead + '</p>' +
      '<div class="doc-total"><span class="doc-total-label">' + totalLabel + '</span><span class="doc-total-value">¥' + yen(tot.payable) + '</span><span class="doc-total-note">（税込）</span></div>' +
      (keyDates.length ? metaList(keyDates).replace('doc-meta', 'doc-meta doc-keydates') : '') +
      '</div>' + fromBlock(p, seal) + '</section>' +
      itemsTable(doc, tot, 6) +
      '<section class="doc-bottom">' + breakdown(doc, tot) + sums(doc, tot, { type: doc.type }) + '</section>' +
      (doc.type === 'invoice' && doc.showBank !== false ? bankBlock(p) : '') +
      (doc.notes ? '<div class="doc-notes"><div class="doc-label">備考</div><div>' + escBr(doc.notes) + '</div></div>' : '') +
      (foot.length ? '<p class="doc-foot">' + foot.join('<br>') + '</p>' : '') +
      '</div>'
    );
  }

  /** 適格請求書の記載事項チェック */
  function checklist(doc, issuer) {
    const p = issuer || {};
    const tot = HS.calc.totals(doc);
    const isTxDated = doc.type === 'delivery' || doc.type === 'receipt' ? !!doc.issueDate : !!doc.txDate;
    const items = [
      { ok: !!p.name, label: '発行者の氏名・名称' },
      { ok: !!U.normRegNo(p.regNo), label: '登録番号（T＋13桁）' },
      { ok: isTxDated, label: doc.type === 'invoice' ? '取引年月日（納品日や「10月分」など）' : '取引年月日' },
      { ok: tot.itemCount > 0, label: '取引内容（品目）' },
      { ok: true, label: '税率ごとの合計額・適用税率（自動）' },
      { ok: true, label: '税率ごとの消費税額（自動）' },
      { ok: !!(doc.client && doc.client.name), label: '書類の交付を受ける事業者の名称（宛先）' }
    ];
    return { items, ok: items.every((x) => x.ok), totals: tot };
  }

  HS.render = { doc: render, checklist };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- editor.js ---- */
/* ひとり請求書 — 書類エディタ（Web版・Pro版で共通） */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const U = HS.util;
  const M = HS.model;
  const { esc } = U;

  const UNITS = ['式', '個', '点', '件', '時間', '日', '人日', '人月', '月', '回', '本', '枚', 'ページ', '文字', '部', 'セット'];
  const COLORS = ['#1f4ea3', '#0f766e', '#334155', '#9a3412', '#7c3aed', '#be123c'];
  let uniq = 0;

  function field(label, key, o) {
    o = o || {};
    return (
      '<label class="f ' + (o.cls || '') + '"' + (o.show ? ' data-show="' + o.show + '"' : '') + '>' +
      '<span class="f-label">' + label + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</span>' +
      (o.area
        ? '<textarea class="in" data-k="' + key + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.ph || '') + '"></textarea>'
        : '<input class="in' + (o.num ? ' num' : '') + '" data-k="' + key + '" type="' + (o.type || 'text') + '"' +
          (o.num ? ' inputmode="decimal"' : '') + (o.list ? ' list="' + o.list + '"' : '') +
          (o.auto ? ' autocomplete="' + o.auto + '"' : '') + ' placeholder="' + esc(o.ph || '') + '">') +
      (o.after || '') +
      '</label>'
    );
  }

  function select(label, key, options, o) {
    o = o || {};
    return (
      '<label class="f ' + (o.cls || '') + '"' + (o.show ? ' data-show="' + o.show + '"' : '') + '>' +
      '<span class="f-label">' + label + '</span><select class="in" data-k="' + key + '"' + (o.t ? ' data-t="' + o.t + '"' : '') + '>' +
      options.map((x) => '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>').join('') +
      '</select></label>'
    );
  }

  function seg(key, options, o) {
    o = o || {};
    const name = 'seg' + ++uniq;
    return (
      '<div class="seg ' + (o.cls || '') + '" role="radiogroup"' + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>' +
      options.map((x) => '<label><input type="radio" name="' + name + '" data-k="' + key + '" value="' + esc(x[0]) + '"><span>' + x[1] + '</span></label>').join('') +
      '</div>'
    );
  }

  function toggle(label, key, o) {
    o = o || {};
    return (
      '<label class="tg ' + (o.cls || '') + '"' + (o.show ? ' data-show="' + o.show + '"' : '') + '><input type="checkbox" data-k="' + key + '"><span class="tg-ui" aria-hidden="true"></span><span class="tg-label">' + label + '</span></label>'
    );
  }

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') return el.value;
    if (el.dataset.t === 'int') return parseInt(el.value, 10) || 0;
    return el.value;
  }

  function writeValue(el, v) {
    if (el.type === 'checkbox') el.checked = v !== false && !!v;
    else if (el.type === 'radio') el.checked = String(v) === el.value;
    else if (document.activeElement !== el || el.tagName === 'SELECT') el.value = v == null ? '' : v;
  }

  /**
   * options: {
   *   edition, doc, profile, watermark,
   *   onDocChange(doc), onProfileChange(profile), onBeforePrint(doc, totals), onAction(act, editor, el),
   *   toolbarExtra: HTML, clientPicker: bool, itemNames: [] , typeLocked: bool
   * }
   */
  function Editor(root, options) {
    this.root = root;
    this.o = options || {};
    this.profile = this.o.profile || HS.profile.load();
    this.doc = this.o.doc || M.newDoc('invoice', this.profile);
    this._honorTouched = false;
    this._schedule = U.debounce(() => this.refresh(), 60);
    this._saveProfile = U.debounce(() => {
      HS.profile.save(this.profile);
      if (this.o.onProfileChange) this.o.onProfileChange(this.profile);
    }, 300);
    this._saveDoc = U.debounce(() => {
      if (this.o.onDocChange) this.o.onDocChange(this.doc);
    }, 300);
    this.build();
    this.load(this.doc);
  }

  Editor.prototype.build = function () {
    const ed = this.o.edition || HS.edition;
    const pro = ed !== 'web';
    const types = M.TYPE_ORDER.map((t) => [t, M.TYPES[t].label]);
    this.root.classList.add('ed');
    this.root.innerHTML =
      '<div class="ed-toolbar">' +
      '<div class="ed-types" role="tablist" aria-label="書類の種類">' +
      types.map((t) => '<button type="button" role="tab" class="ed-type" data-act="type" data-type="' + t[0] + '">' + t[1] + '</button>').join('') +
      '</div>' +
      '<div class="ed-actions">' + (this.o.toolbarExtra || '') +
      '<button type="button" class="btn btn-primary" data-act="print"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/></svg>PDF保存・印刷</button>' +
      '</div></div>' +
      '<div class="ed-body"><div class="ed-form">' +
      // 書類情報
      '<section class="card"><h3 class="card-h">書類情報</h3><div class="grid g3">' +
      field('<span data-label="numLabel">書類番号</span>', 'd.number', { ph: '例: INV-2026-001' }) +
      field('<span data-label="dateLabel">発行日</span>', 'd.issueDate', { type: 'date' }) +
      field('お支払期限', 'd.dueDate', { type: 'date', show: 'invoice' }) +
      field('有効期限', 'd.validUntil', { type: 'date', show: 'estimate' }) +
      '</div>' +
      '<div class="quick" data-show="invoice"><span>期限：</span>' +
      [['eom0', '当月末'], ['eom1', '翌月末'], ['eom2', '翌々月末'], ['d30', '30日後'], ['d60', '60日後']]
        .map((x) => '<button type="button" class="chip" data-act="due" data-rule="' + x[0] + '">' + x[1] + '</button>').join('') +
      '</div>' +
      '<div class="grid g2">' +
      field('件名', 'd.subject', { ph: '例: Webサイト制作', show: 'estimate delivery invoice' }) +
      field('<span data-label="txLabel">取引年月日</span>', 'd.txDate', { ph: '例: 2026年10月分 / 10月1日〜31日', show: 'estimate invoice', hint: '<span data-show="invoice">インボイスの記載事項</span>' }) +
      '</div></section>' +
      // 宛先
      '<section class="card"><h3 class="card-h">宛先</h3>' +
      (this.o.clientPicker ? '<div class="picker"><select class="in" data-act="pick-client" aria-label="登録済みの取引先から選ぶ"><option value="">登録済みの取引先から選ぶ…</option></select><button type="button" class="btn btn-ghost btn-sm" data-act="save-client">この宛先を登録</button></div>' : '') +
      '<div class="grid g-client">' +
      field('宛名（会社名・氏名）', 'd.client.name', { ph: '例: 株式会社サンプル', auto: 'organization' }) +
      select('敬称', 'd.client.honor', [['御中', '御中'], ['様', '様'], ['殿', '殿'], ['', 'なし']]) +
      '</div><details class="more"><summary>住所・部署・担当者を入れる</summary><div class="grid g2">' +
      field('部署', 'd.client.dept', { ph: '例: 経理部' }) +
      field('担当者', 'd.client.person', { ph: '例: 佐藤 花子 様' }) +
      field('郵便番号', 'd.client.zip', { ph: '100-0001' }) +
      field('住所', 'd.client.address', { ph: '東京都千代田区…' }) +
      '</div></details></section>' +
      // 明細
      '<section class="card"><h3 class="card-h">明細<span class="card-sub" data-role="item-mode"></span></h3>' +
      '<div class="it-head" aria-hidden="true"><span>品目・内容</span><span>数量</span><span>単位</span><span>単価</span><span>税率</span><span>金額</span><span></span></div>' +
      '<div class="it-list" data-role="items"></div>' +
      '<div class="it-foot"><button type="button" class="btn btn-ghost" data-act="item-add">＋ 行を追加</button>' +
      '<div class="it-total" data-role="mini-total"></div></div>' +
      '<datalist id="hs-units">' + UNITS.map((u) => '<option value="' + u + '">').join('') + '</datalist>' +
      '<datalist id="hs-itemlist"></datalist>' +
      '</section>' +
      // 領収書
      '<section class="card" data-show="receipt"><h3 class="card-h">領収書の設定</h3><div class="grid g2">' +
      field('但し書き', 'd.receipt.purpose', { ph: '例: Webサイト制作費として' }) +
      select('お支払方法', 'd.receipt.method', [['銀行振込', '銀行振込'], ['現金', '現金'], ['クレジットカード', 'クレジットカード'], ['電子マネー・QR決済', '電子マネー・QR決済'], ['', '表示しない']]) +
      '</div>' + toggle('紙で手渡し・郵送する（収入印紙の欄を表示）', 'd.receipt.paper') +
      '<p class="notice" data-role="stamp-note"></p></section>' +
      // 計算設定
      '<section class="card"><h3 class="card-h">計算の設定</h3>' +
      '<div class="row-set"><span class="row-label">単価の入力</span>' + seg('d.calc.taxMode', [['exclusive', '税抜（外税）'], ['inclusive', '税込（内税）']]) + '</div>' +
      '<div class="row-set"><span class="row-label">消費税の端数</span>' + seg('d.calc.rounding', [['floor', '切り捨て'], ['round', '四捨五入'], ['ceil', '切り上げ']]) + '</div>' +
      '<div class="row-set">' + toggle('源泉徴収をする（個人への原稿料・デザイン料など）', 'd.calc.withholding') + '</div>' +
      '<div class="row-set" data-role="whbase"><span class="row-label">源泉の対象額</span>' + seg('d.calc.whBase', [['net', '税抜'], ['gross', '税込']]) + '</div>' +
      '<p class="hint">端数処理はインボイス制度のルールどおり「1枚の書類につき税率ごとに1回」で計算します。</p>' +
      '</section>' +
      // 備考
      '<section class="card"><h3 class="card-h">備考</h3>' +
      field('', 'd.notes', { area: true, rows: 3, ph: '例: お振込手数料は貴社にてご負担ください。' }) +
      toggle('振込先を表示する', 'd.showBank', { show: 'invoice' }) +
      '</section>' +
      // 発行者
      '<details class="card card-issuer" data-role="issuer"><summary class="card-h">発行者情報（あなたの情報）<span class="card-sub" data-role="issuer-sum"></span></summary>' +
      '<p class="hint">ここに入れた情報はこの端末のブラウザに保存され、次回から自動で入ります（サーバーには送信しません）。</p>' +
      '<div class="grid g2">' +
      field('屋号・会社名（または氏名）', 'p.name', { ph: '例: 山田デザイン事務所', auto: 'organization' }) +
      field('氏名・担当者', 'p.person', { ph: '例: 山田 太郎', auto: 'name' }) +
      field('登録番号（インボイス）', 'p.regNo', { ph: 'T1234567890123', hint: '未登録なら空欄でOK', after: '<span class="f-msg" data-role="regno-msg"></span>' }) +
      field('電話番号', 'p.tel', { ph: '03-1234-5678', auto: 'tel' }) +
      field('郵便番号', 'p.zip', { ph: '150-0001', auto: 'postal-code' }) +
      field('メール', 'p.email', { ph: 'info@example.com', auto: 'email', type: 'email' }) +
      field('住所', 'p.address', { area: true, rows: 2, ph: '東京都渋谷区…', cls: 'span2' }) +
      '</div>' +
      '<h4 class="sub-h">振込先</h4><div class="grid g3">' +
      field('銀行名', 'p.bank.name', { ph: '○○銀行' }) +
      field('支店名', 'p.bank.branch', { ph: '○○支店' }) +
      select('種別', 'p.bank.kind', [['普通', '普通'], ['当座', '当座'], ['貯蓄', '貯蓄']]) +
      field('口座番号', 'p.bank.number', { ph: '1234567' }) +
      field('口座名義（カナ）', 'p.bank.holder', { ph: 'ヤマダ タロウ', cls: 'span2' }) +
      '</div>' +
      '<h4 class="sub-h">印影・ロゴ</h4>' +
      '<div class="row-set"><span class="row-label">印影</span>' + seg('p.seal.mode', [['none', 'なし'], ['auto', '文字から作る'], ['image', '画像を使う']]) + '</div>' +
      '<div class="grid g2" data-role="seal-auto">' +
      field('印影の文字', 'p.seal.text', { ph: '例: 山田（空欄なら氏名）' }) +
      '<div class="f"><span class="f-label">形</span>' + seg('p.seal.style', [['round', '丸印'], ['square', '角印']]) + '</div>' +
      '</div>' +
      '<div class="upload-row" data-role="seal-image"><label class="btn btn-ghost btn-sm">印影の画像を選ぶ<input type="file" accept="image/*" data-act="seal-file" hidden></label><span class="hint">白い紙に押した印影を撮影した画像でOK。背景は自動で透明になります。</span><button type="button" class="btn btn-link btn-sm" data-act="seal-clear">削除</button></div>' +
      '<div class="upload-row"><span class="row-label">ロゴ</span><label class="btn btn-ghost btn-sm">ロゴ画像を選ぶ<input type="file" accept="image/*" data-act="logo-file" hidden></label><button type="button" class="btn btn-link btn-sm" data-act="logo-clear">削除</button></div>' +
      '</details>' +
      // デザイン
      '<details class="card"><summary class="card-h">デザイン</summary>' +
      '<div class="row-set"><span class="row-label">テンプレート</span>' + seg('p.design.template', [['standard', 'スタンダード'], ['modern', 'モダン'], ['classic', 'クラシック']]) + '</div>' +
      '<div class="row-set"><span class="row-label">書体</span>' + seg('p.design.font', [['gothic', 'ゴシック'], ['mincho', '明朝']]) + '</div>' +
      '<div class="row-set"><span class="row-label">日付</span>' + seg('p.design.dateStyle', [['west', '西暦'], ['wareki', '和暦']]) + '</div>' +
      '<div class="row-set"><span class="row-label">アクセント色</span><div class="swatches">' +
      COLORS.map((c) => '<button type="button" class="sw" data-act="color" data-color="' + c + '" style="--sw:' + c + '" aria-label="色 ' + c + '"></button>').join('') +
      '</div></div></details>' +
      (pro ? '' : '<div class="ed-tools"><button type="button" class="btn btn-ghost btn-sm" data-act="sample">サンプルを入れてみる</button><button type="button" class="btn btn-ghost btn-sm" data-act="new">新しく作る（入力をクリア）</button></div>') +
      '</div>' + // /ed-form
      // プレビュー
      '<div class="ed-preview" data-role="preview-pane">' +
      '<div class="pv-bar"><div class="pv-check" data-role="check"></div>' +
      '<button type="button" class="btn btn-ghost btn-sm pv-close" data-act="preview-close">閉じる</button></div>' +
      '<div class="pv-scroller"><div class="paper-wrap" data-role="paper-wrap"><div class="paper" data-role="paper"></div></div></div>' +
      '<p class="pv-tip">PDF保存のコツ：印刷画面で「送信先：PDFに保存」「用紙：A4」を選び、「ヘッダーとフッター」はオフに。</p>' +
      '</div></div>' +
      '<div class="ed-mobilebar"><button type="button" class="btn btn-ghost" data-act="preview-open">プレビュー</button><button type="button" class="btn btn-primary" data-act="print">PDF保存・印刷</button></div>';

    this.paper = this.root.querySelector('[data-role="paper"]');
    this.paperWrap = this.root.querySelector('[data-role="paper-wrap"]');

    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('change', (e) => this.onInput(e, true));
    this.root.addEventListener('click', (e) => this.onClick(e));

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.fitPaper());
      this._ro.observe(this.root.querySelector('.pv-scroller'));
    }
    g.addEventListener('resize', U.debounce(() => this.fitPaper(), 100));
  };

  Editor.prototype.state = function () {
    return { d: this.doc, p: this.profile };
  };

  Editor.prototype.load = function (doc, profile) {
    if (profile) this.profile = profile;
    this.doc = doc;
    if (!this.doc.items || !this.doc.items.length) this.doc.items = [M.newItem()];
    this._honorTouched = !!(doc.client && doc.client.name);
    this.renderItems();
    this.fillAll();
    this.applyType();
    this.refresh();
  };

  Editor.prototype.fillAll = function (scope) {
    const st = this.state();
    (scope || this.root).querySelectorAll('[data-k]').forEach((el) => {
      if (el.type === 'file') return;
      writeValue(el, U.getPath(st, el.dataset.k));
    });
    const issuer = this.root.querySelector('[data-role="issuer"]');
    if (issuer && !scope && !this.profile.name) issuer.open = true;
  };

  Editor.prototype.renderItems = function () {
    const box = this.root.querySelector('[data-role="items"]');
    const wh = this.doc.calc && this.doc.calc.withholding;
    box.innerHTML = this.doc.items
      .map((it, i) => {
        return (
          '<div class="it-row" data-i="' + i + '">' +
          '<input class="in it-name" data-k="d.items.' + i + '.name" placeholder="品目・内容" list="hs-itemlist" aria-label="品目' + (i + 1) + '">' +
          '<input class="in num it-qty" data-k="d.items.' + i + '.qty" inputmode="decimal" placeholder="1" aria-label="数量">' +
          '<input class="in it-unit" data-k="d.items.' + i + '.unit" list="hs-units" placeholder="式" aria-label="単位">' +
          '<input class="in num it-price" data-k="d.items.' + i + '.price" inputmode="decimal" placeholder="単価" aria-label="単価">' +
          '<select class="in it-rate" data-k="d.items.' + i + '.rate" data-t="int" aria-label="税率"><option value="10">10%</option><option value="8">8%軽減</option><option value="0">対象外</option></select>' +
          '<output class="it-amt" data-amt="' + i + '">0</output>' +
          '<div class="it-ops">' +
          (wh ? '<label class="it-wh" title="源泉徴収の対象にする"><input type="checkbox" data-k="d.items.' + i + '.wh">源泉</label>' : '') +
          '<button type="button" class="ib" data-act="item-up" data-i="' + i + '" aria-label="上へ移動" title="上へ">↑</button>' +
          '<button type="button" class="ib" data-act="item-down" data-i="' + i + '" aria-label="下へ移動" title="下へ">↓</button>' +
          '<button type="button" class="ib ib-del" data-act="item-del" data-i="' + i + '" aria-label="行を削除" title="削除">×</button>' +
          '</div></div>'
        );
      })
      .join('');
    this.fillAll(box);
  };

  Editor.prototype.applyType = function () {
    const t = this.doc.type;
    const T = M.TYPES[t];
    this.root.querySelectorAll('[data-show]').forEach((el) => {
      el.hidden = el.dataset.show.split(' ').indexOf(t) < 0;
    });
    this.root.querySelectorAll('.ed-type').forEach((b) => {
      const on = b.dataset.type === t;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const set = (k, v) => this.root.querySelectorAll('[data-label="' + k + '"]').forEach((el) => (el.textContent = v));
    set('numLabel', T.numLabel);
    set('dateLabel', T.dateLabel);
    set('txLabel', t === 'estimate' ? '納期・期間' : '取引年月日');
    this.root.dataset.type = t;
  };

  Editor.prototype.onInput = function (e, isChange) {
    const el = e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.act === 'pick-client' && isChange) return this.action('pick-client', el);
    if (el.type === 'file' && isChange) return this.action(el.dataset.act, el);
    const k = el.dataset.k;
    if (!k) return;
    if (!isChange && (el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT')) return;
    if (isChange && el.type !== 'radio' && el.type !== 'checkbox' && el.tagName !== 'SELECT' && el.type !== 'date') return;
    U.setPath(this.state(), k, readValue(el));
    this.after(k, el);
  };

  Editor.prototype.after = function (k, el) {
    const isProfile = k.indexOf('p.') === 0;
    if (k === 'd.client.honor') this._honorTouched = true;
    if (k === 'd.client.name' && !this._honorTouched) {
      this.doc.client.honor = this.doc.type === 'receipt' ? '様' : M.guessHonor(this.doc.client.name);
      this.fillAll(this.root.querySelector('[data-k="d.client.honor"]').parentNode);
    }
    if (k === 'd.calc.withholding') this.renderItems();
    if (k.indexOf('d.calc.') === 0) {
      const key = k.slice(7);
      this.profile.defaults[key] = U.getPath(this.state(), k);
      this._saveProfile();
    }
    if (/^d\.items\.\d+\.name$/.test(k) && this.o.itemLookup) {
      const i = +k.split('.')[2];
      const hit = this.o.itemLookup(this.doc.items[i].name);
      if (hit && !U.num(this.doc.items[i].price)) {
        Object.assign(this.doc.items[i], { price: hit.price, unit: hit.unit || this.doc.items[i].unit, rate: hit.rate == null ? 10 : hit.rate });
        this.fillAll(el.closest('.it-row'));
      }
    }
    if (k === 'd.issueDate' && this.doc._autoNo && this.o.autoNumber) this.o.autoNumber(this);
    if (k === 'd.number') this.doc._autoNo = false;
    if (k === 'p.regNo') this.regNoMsg();
    if (isProfile) this._saveProfile();
    this.doc.updatedAt = Date.now();
    this._saveDoc();
    this._schedule();
  };

  Editor.prototype.regNoMsg = function () {
    const msg = this.root.querySelector('[data-role="regno-msg"]');
    if (!msg) return;
    const v = this.profile.regNo;
    const n = U.normRegNo(v);
    msg.textContent = !v ? '' : n === null ? '「T」＋13桁の数字で入力してください' : n !== v ? '「' + n + '」として表示します' : '';
    msg.className = 'f-msg' + (v && n === null ? ' is-error' : '');
  };

  Editor.prototype.onClick = function (e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || (b.tagName === 'INPUT' && b.type === 'file')) return;
    this.action(b.dataset.act, b, e);
  };

  Editor.prototype.action = async function (act, el, e) {
    const d = this.doc;
    switch (act) {
      case 'type': {
        const to = el.dataset.type;
        if (to === d.type) return;
        if (this.o.onTypeSwitch && this.o.onTypeSwitch(to, this) === false) return;
        this.switchType(to);
        return;
      }
      case 'print':
        return this.print();
      case 'due':
        d.dueDate = U.dueByRule(d.issueDate, el.dataset.rule);
        this.profile.defaults.dueRule = el.dataset.rule;
        this._saveProfile();
        this.fillAll(this.root.querySelector('[data-k="d.dueDate"]').parentNode);
        return this.after('d.dueDate');
      case 'item-add':
        d.items.push(M.newItem(d.items.length ? d.items[d.items.length - 1].rate : 10));
        this.renderItems();
        this.root.querySelector('[data-k="d.items.' + (d.items.length - 1) + '.name"]').focus();
        return this.after('d.items');
      case 'item-del': {
        const i = +el.dataset.i;
        d.items.splice(i, 1);
        if (!d.items.length) d.items.push(M.newItem());
        this.renderItems();
        return this.after('d.items');
      }
      case 'item-up':
      case 'item-down': {
        const i = +el.dataset.i;
        const j = act === 'item-up' ? i - 1 : i + 1;
        if (j < 0 || j >= d.items.length) return;
        const tmp = d.items[i];
        d.items[i] = d.items[j];
        d.items[j] = tmp;
        this.renderItems();
        return this.after('d.items');
      }
      case 'color':
        this.profile.design.color = el.dataset.color;
        return this.after('p.design.color');
      case 'seal-file':
      case 'logo-file': {
        const f = el.files && el.files[0];
        el.value = '';
        if (!f) return;
        try {
          if (act === 'seal-file') {
            this.profile.seal.image = await HS.seal.processSealImage(f);
            this.profile.seal.mode = 'image';
          } else {
            this.profile.logo = await HS.seal.processLogo(f);
          }
          this.fillAll(this.root.querySelector('[data-role="issuer"]'));
          this.after('p.' + (act === 'seal-file' ? 'seal.image' : 'logo'));
          U.toast(act === 'seal-file' ? '印影を設定しました' : 'ロゴを設定しました', 'ok');
        } catch (err) {
          U.toast(err.message || '画像を読み込めませんでした', 'error');
        }
        return;
      }
      case 'seal-clear':
        this.profile.seal.image = '';
        if (this.profile.seal.mode === 'image') this.profile.seal.mode = 'none';
        this.fillAll(this.root.querySelector('[data-role="issuer"]'));
        return this.after('p.seal.image');
      case 'logo-clear':
        this.profile.logo = '';
        return this.after('p.logo');
      case 'sample': {
        if (!this.profile.name) {
          const keep = this.profile;
          this.profile = M.mergeDefaults(keep, M.sampleProfile());
          this._saveProfile();
          U.toast('発行者情報にもサンプルを入れました。あなたの情報に書き換えてください。');
        }
        const s = M.sampleDoc(d.type, this.profile);
        s.calc = Object.assign({}, d.calc);
        this.load(s);
        return this.after('d');
      }
      case 'new': {
        if (!g.confirm('入力中の書類をクリアして新しく作りますか？（発行者情報は残ります）')) return;
        const n = M.newDoc(d.type, this.profile);
        this.load(n);
        return this.after('d');
      }
      case 'preview-open':
        this.root.classList.add('is-preview');
        document.documentElement.classList.add('hs-noscroll');
        this.fitPaper();
        return;
      case 'preview-close':
        this.root.classList.remove('is-preview');
        document.documentElement.classList.remove('hs-noscroll');
        return;
      default:
        if (this.o.onAction) return this.o.onAction(act, this, el, e);
    }
  };

  Editor.prototype.switchType = function (to) {
    const d = this.doc;
    d.type = to;
    M.applyTypeDefaults(d, this.profile);
    if (to === 'receipt' && !d.receipt.purpose && d.subject) d.receipt.purpose = d.subject + '代として';
    if (this.o.autoNumber && (d._autoNo || !d.number)) this.o.autoNumber(this);
    this.fillAll();
    this.applyType();
    this.after('d.type');
  };

  Editor.prototype.refresh = function () {
    const d = this.doc;
    const chk = HS.render.checklist(d, this.profile);
    const tot = chk.totals;
    // 明細の金額
    tot.lines.forEach((l, i) => {
      const out = this.root.querySelector('[data-amt="' + i + '"]');
      if (out) out.textContent = l.blank ? '' : U.yen(l.amount);
    });
    const mini = this.root.querySelector('[data-role="mini-total"]');
    if (mini) {
      mini.innerHTML =
        '<span>合計（税込）<b>¥' + U.yen(tot.gross) + '</b></span>' +
        (tot.whTax ? '<span>源泉徴収 <b>−¥' + U.yen(tot.whTax) + '</b></span><span>差引 <b>¥' + U.yen(tot.payable) + '</b></span>' : '');
    }
    const mode = this.root.querySelector('[data-role="item-mode"]');
    if (mode) mode.textContent = d.calc.taxMode === 'inclusive' ? '単価は税込' : '単価は税抜';
    const wb = this.root.querySelector('[data-role="whbase"]');
    if (wb) wb.hidden = !d.calc.withholding;
    // 印紙
    const sn = this.root.querySelector('[data-role="stamp-note"]');
    if (sn) {
      sn.innerHTML = tot.stamp
        ? '受取金額（税抜）が5万円以上なので、<b>紙で渡す場合は' + U.yen(tot.stamp) + '円の収入印紙</b>が必要です。PDFをメール等で送るだけなら印紙は不要です。'
        : '受取金額（税抜）が5万円未満のため、収入印紙は不要です。';
    }
    // 発行者サマリー
    const sum = this.root.querySelector('[data-role="issuer-sum"]');
    if (sum) sum.textContent = this.profile.name ? '：' + this.profile.name + (U.normRegNo(this.profile.regNo) ? '（登録番号あり）' : '') : '：未入力';
    const sa = this.root.querySelector('[data-role="seal-auto"]');
    const si = this.root.querySelector('[data-role="seal-image"]');
    if (sa) sa.hidden = this.profile.seal.mode !== 'auto';
    if (si) si.hidden = this.profile.seal.mode !== 'image';
    this.root.querySelectorAll('.sw').forEach((b) => b.classList.toggle('is-on', b.dataset.color === this.profile.design.color));
    // チェック
    const ck = this.root.querySelector('[data-role="check"]');
    if (ck) {
      const qualified = d.type !== 'estimate';
      if (!qualified) {
        ck.innerHTML = '<span class="badge">見積書（インボイスの要件対象外）</span>';
      } else {
        const miss = chk.items.filter((x) => !x.ok);
        ck.innerHTML = chk.ok
          ? '<span class="badge is-ok">✓ 適格請求書（インボイス）の記載事項を満たしています</span>'
          : '<details class="badge-details"><summary class="badge is-warn">インボイスの記載事項：あと' + miss.length + '項目</summary><ul>' +
            chk.items.map((x) => '<li class="' + (x.ok ? 'ok' : 'ng') + '">' + (x.ok ? '✓ ' : '・') + esc(x.label) + '</li>').join('') +
            '</ul><p>登録番号がない（免税事業者）場合は、通常の請求書として使えます。</p></details>';
      }
    }
    this.paper.innerHTML = HS.render.doc(d, this.profile, { watermark: this.o.watermark });
    this.fitPaper();
    this._totals = tot;
    if (this.o.onRefresh) this.o.onRefresh(this, tot);
  };

  Editor.prototype.fitPaper = function () {
    const sc = this.root.querySelector('.pv-scroller');
    const docEl = this.paper.firstElementChild;
    if (!sc || !docEl) return;
    const avail = sc.clientWidth - 2;
    const w = docEl.offsetWidth || 794;
    const s = Math.min(1, avail / w);
    this.paper.style.transform = 'scale(' + s + ')';
    this.paperWrap.style.height = Math.ceil(docEl.offsetHeight * s) + 'px';
    this.paperWrap.style.width = Math.ceil(w * s) + 'px';
  };

  Editor.prototype.print = function () {
    const d = this.doc;
    const tot = HS.calc.totals(d);
    if (!tot.itemCount && !g.confirm('明細が空です。このまま出力しますか？')) return;
    if (this.o.onBeforePrint && this.o.onBeforePrint(d, tot, this) === false) return;
    let pr = document.getElementById('hs-print-root');
    if (!pr) {
      pr = document.createElement('div');
      pr.id = 'hs-print-root';
      pr.className = 'print-root';
      document.body.appendChild(pr);
    }
    pr.innerHTML = HS.render.doc(d, this.profile, { watermark: this.o.watermark });
    const old = document.title;
    document.title = M.fileName(d, tot);
    const restore = () => {
      document.title = old;
      g.removeEventListener('afterprint', restore);
    };
    g.addEventListener('afterprint', restore);
    setTimeout(() => g.print(), 30);
    if (g.gtag) g.gtag('event', 'print_doc', { doc_type: d.type });
  };

  Editor.prototype.setItemNames = function (names) {
    const dl = this.root.querySelector('#hs-itemlist');
    if (dl) dl.innerHTML = names.map((n) => '<option value="' + esc(n) + '">').join('');
  };

  Editor.prototype.setClients = function (clients) {
    const sel = this.root.querySelector('[data-act="pick-client"]');
    if (!sel) return;
    sel.innerHTML = '<option value="">登録済みの取引先から選ぶ…</option>' + clients.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
  };

  HS.Editor = Editor;
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- tools.js ---- */
/* ひとり請求書 — 計算ツール（消費税シミュレーター・源泉徴収・収入印紙） */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const U = HS.util;
  const { yen, esc } = U;

  const YEARS = [
    [2026, '2026年（令和8年）分'],
    [2027, '2027年（令和9年）分'],
    [2028, '2028年（令和10年）分'],
    [2029, '2029年（令和11年）分'],
    [2030, '2030年（令和12年）分']
  ];

  function opt(list, sel) {
    return list.map((x) => '<option value="' + x[0] + '"' + (String(x[0]) === String(sel) ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('');
  }

  function bars(rows, maxV) {
    const max = maxV || Math.max.apply(null, rows.map((r) => Math.max(0, r.value))) || 1;
    return (
      '<div class="bars">' +
      rows
        .map(
          (r) =>
            '<div class="bar-row' + (r.cls ? ' ' + r.cls : '') + '"><span class="bar-label">' + r.label + '</span>' +
            '<span class="bar-track"><span class="bar-fill" style="width:' + Math.max(1.5, (Math.max(0, r.value) / max) * 100).toFixed(1) + '%"></span></span>' +
            '<span class="bar-value">' + r.text + '</span></div>'
        )
        .join('') +
      '</div>'
    );
  }

  // ---------------- 消費税シミュレーター ----------------
  function mountCtax(root, opts) {
    opts = opts || {};
    const saved = HS.store.get('ctax', null) || {};
    const st = Object.assign(
      { year: 2027, salesInclusive: false, sales10: '6000000', sales8: '', purchases10: '', purchases8: '', nonQualified10: '', business: 5, converted: true, base10m: true, base50m: true, reduced: false },
      saved,
      opts.preset || {}
    );
    const bizOpts = Object.keys(HS.ctax.SIMPLE).map((k) => [k, HS.ctax.SIMPLE[k].label]);
    root.classList.add('tool');
    root.innerHTML =
      '<div class="tool-grid"><form class="tool-form card" autocomplete="off" onsubmit="return false">' +
      '<div class="grid g2">' +
      '<label class="f"><span class="f-label">申告する年分</span><select class="in" name="year">' + opt(YEARS, st.year) + '</select></label>' +
      '<label class="f"><span class="f-label">事業の種類（簡易課税の区分）</span><select class="in" name="business">' + opt(bizOpts, st.business) + '</select></label>' +
      '</div>' +
      '<p class="hint" data-role="bizex"></p>' +
      '<div class="row-set"><span class="row-label">売上の金額</span><div class="seg"><label><input type="radio" name="salesInclusive" value="0"><span>税抜で入力</span></label><label><input type="radio" name="salesInclusive" value="1"><span>税込で入力</span></label></div></div>' +
      '<div class="grid g2">' +
      '<label class="f"><span class="f-label">年間の売上（10%）</span><input class="in num" name="sales10" inputmode="numeric" placeholder="6,000,000"></label>' +
      '<label class="f" data-role="s8"><span class="f-label">年間の売上（8%軽減）</span><input class="in num" name="sales8" inputmode="numeric" placeholder="0"></label>' +
      '</div>' +
      '<label class="tg"><input type="checkbox" name="reduced"><span class="tg-ui"></span><span class="tg-label">軽減税率（8%）の売上・仕入れがある</span></label>' +
      '<h4 class="sub-h">経費（本則課税の計算に使用）</h4>' +
      '<div class="grid g2">' +
      '<label class="f"><span class="f-label">消費税がかかる経費（10%・税込）<small>外注費・家賃(事務所)・通信費など</small></span><input class="in num" name="purchases10" inputmode="numeric" placeholder="0"></label>' +
      '<label class="f"><span class="f-label">うちインボイスがない相手への支払い</span><input class="in num" name="nonQualified10" inputmode="numeric" placeholder="0"></label>' +
      '<label class="f" data-role="p8"><span class="f-label">消費税がかかる経費（8%・税込）</span><input class="in num" name="purchases8" inputmode="numeric" placeholder="0"></label>' +
      '</div>' +
      '<p class="hint">給与・社会保険料・保険料・税金・住宅家賃などは消費税がかからないため含めません。</p>' +
      '<h4 class="sub-h">あなたの状況</h4>' +
      '<label class="tg"><input type="checkbox" name="converted"><span class="tg-ui"></span><span class="tg-label">免税事業者からインボイス登録して課税事業者になった</span></label>' +
      '<label class="tg"><input type="checkbox" name="base10m"><span class="tg-ui"></span><span class="tg-label">2年前の課税売上高が1,000万円以下</span></label>' +
      '<label class="tg"><input type="checkbox" name="base50m"><span class="tg-ui"></span><span class="tg-label">2年前の課税売上高が5,000万円以下（簡易課税の条件）</span></label>' +
      (opts.importBtn ? '<div class="row-set"><button type="button" class="btn btn-ghost btn-sm" data-act="import">書類一覧から売上を取り込む</button></div>' : '') +
      '</form>' +
      '<div class="tool-result" data-role="result" aria-live="polite"></div></div>';

    const form = root.querySelector('form');
    const res = root.querySelector('[data-role="result"]');

    function fill() {
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        if (el.type === 'radio') el.checked = String(+!!st[el.name]) === el.value;
        else if (el.type === 'checkbox') el.checked = !!st[el.name];
        else el.value = st[el.name] == null ? '' : st[el.name];
      });
    }
    function read() {
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        if (el.type === 'radio') {
          if (el.checked) st[el.name] = el.value === '1';
        } else if (el.type === 'checkbox') st[el.name] = el.checked;
        else st[el.name] = el.value;
      });
      st.year = +st.year;
      st.business = +st.business;
    }

    function render() {
      read();
      HS.store.set('ctax', st);
      root.querySelectorAll('[data-role="s8"],[data-role="p8"]').forEach((el) => (el.hidden = !st.reduced));
      const input = Object.assign({}, st, st.reduced ? {} : { sales8: 0, purchases8: 0 });
      root.querySelector('[data-role="bizex"]').textContent = '例：' + HS.ctax.SIMPLE[st.business].ex;
      const r = HS.ctax.compute(input);
      const pj = HS.ctax.projection(input);
      const cards = r.methods
        .map((m) => {
          const cls = 'mcard' + (m.best ? ' is-best' : '') + (m.eligible ? '' : ' is-na');
          return (
            '<div class="' + cls + '">' +
            (m.best ? '<span class="mcard-badge">いちばん有利</span>' : '') +
            '<div class="mcard-h">' + esc(m.label) + '</div>' +
            '<div class="mcard-v">' + (m.eligible ? (m.refund ? '還付 ' + yen(-m.total) : yen(m.total)) + '<small>円</small>' : '<span class="na">適用できません</span>') + '</div>' +
            (m.eligible && r.netSales ? '<div class="mcard-r">売上（税抜）の ' + (m.rate * 100).toFixed(1) + '%</div>' : '') +
            '<p class="mcard-n">' + esc(m.note) + '</p>' +
            '<details class="mcard-d"><summary>計算の内訳</summary><dl>' +
            '<div><dt>売上の消費税額（国税）</dt><dd>' + yen(r.outputTax) + '円</dd></div>' +
            '<div><dt>控除する税額</dt><dd>' + yen(m.deduct) + '円</dd></div>' +
            '<div><dt>差引税額（国税）</dt><dd>' + yen(m.national) + '円</dd></div>' +
            '<div><dt>地方消費税</dt><dd>' + yen(m.local) + '円</dd></div>' +
            '</dl></details></div>'
          );
        })
        .join('');
      const now = pj[0].best.total;
      const proj = bars(
        pj.map((p) => ({
          label: p.year + '年',
          value: p.best.total,
          text: yen(p.best.total) + '円<small>（' + esc(p.best.label) + '）</small>',
          cls: p.year === st.year ? 'is-cur' : ''
        }))
      );
      const later = pj.find((p) => p.year === 2029);
      const diff = later ? later.best.total - now : 0;
      res.innerHTML =
        '<div class="card tool-out">' +
        '<div class="out-h">' + st.year + '年分の消費税（国税＋地方）の目安</div>' +
        '<div class="mcards">' + cards + '</div>' +
        '<p class="hint">課税標準額の千円未満・納付税額の百円未満を切り捨てて計算しています。実際の申告額とは異なる場合があります。</p>' +
        '</div>' +
        '<div class="card tool-out"><div class="out-h">同じ売上・経費が続いた場合の年ごとの納税額（最も有利な方法）</div>' + proj +
        (diff > 0 ? '<p class="callout">2割特例が使える2026年分と比べて、<b>2029年分は年間 約' + yen(diff) + '円</b> 消費税の負担が増える見込みです。早めに資金の準備や申告方法の検討を。</p>' : '') +
        '</div>' +
        '<div class="card tool-out tool-next"><div class="out-h">次にやること</div><ul class="checks">' +
        '<li><b>3割特例は届出不要</b>。令和9年・10年分の確定申告書に適用する旨を書くだけで使えます（個人事業者のみ）。</li>' +
        '<li><b>簡易課税</b>を使うには「簡易課税制度選択届出書」が必要。2割特例・3割特例を使った年の<b>翌年分の申告期限まで</b>に出せば、その翌年分から適用できます（令和8年度改正）。原則2年間は継続適用です。</li>' +
        '<li><b>本則課税</b>は経費のインボイス（適格請求書）の保存が必要。インボイスのない仕入れは2026年10月〜2028年9月は70%、その後50%→30%と控除できる割合が下がります。</li>' +
        '</ul><div data-aff="accounting" data-aff-title="消費税の申告に対応した会計ソフト"></div></div>';
      if (HS.site && HS.site.renderAffiliates) HS.site.renderAffiliates(res);
    }

    fill();
    form.addEventListener('input', U.debounce(render, 120));
    form.addEventListener('change', render);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="import"]');
      if (b && opts.onImport) {
        const v = opts.onImport(st.year);
        if (v) {
          Object.assign(st, v);
          fill();
          render();
        }
      }
    });
    render();
    return { setInput(v) { Object.assign(st, v); fill(); render(); } };
  }

  // ---------------- 源泉徴収 ----------------
  function mountGensen(root) {
    const st = Object.assign({ mode: 'fwd', amount: '100000', taxRate: 10, whOnGross: false }, HS.store.get('gensen', null) || {});
    root.classList.add('tool');
    root.innerHTML =
      '<div class="tool-grid"><form class="tool-form card" onsubmit="return false">' +
      '<div class="seg seg-lg"><label><input type="radio" name="mode" value="fwd"><span>報酬額から計算</span></label><label><input type="radio" name="mode" value="rev"><span>振込額（手取り）から逆算</span></label></div>' +
      '<label class="f"><span class="f-label" data-role="amt-label">報酬額（税抜）</span><input class="in num in-xl" name="amount" inputmode="numeric" placeholder="100,000"></label>' +
      '<div class="row-set"><span class="row-label">消費税</span><div class="seg"><label><input type="radio" name="taxRate" value="10"><span>10%を加算</span></label><label><input type="radio" name="taxRate" value="0"><span>加算しない（免税事業者など）</span></label></div></div>' +
      '<div class="row-set"><span class="row-label">源泉の対象</span><div class="seg"><label><input type="radio" name="whOnGross" value="0"><span>税抜額</span></label><label><input type="radio" name="whOnGross" value="1"><span>税込額</span></label></div></div>' +
      '<p class="hint">請求書で報酬と消費税が分けて書かれていれば、税抜額を対象にできます。</p>' +
      '</form><div class="tool-result" data-role="result" aria-live="polite"></div></div>';
    const form = root.querySelector('form');
    const res = root.querySelector('[data-role="result"]');
    function fill() {
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        if (el.type === 'radio') el.checked = String(el.name === 'whOnGross' ? +!!st.whOnGross : st[el.name]) === el.value;
        else el.value = st[el.name];
      });
    }
    function render() {
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        if (el.type === 'radio') {
          if (el.checked) st[el.name] = el.name === 'whOnGross' ? el.value === '1' : el.name === 'taxRate' ? +el.value : el.value;
        } else st[el.name] = el.value;
      });
      HS.store.set('gensen', st);
      root.querySelector('[data-role="amt-label"]').textContent = st.mode === 'rev' ? '振込してほしい金額（手取り）' : '報酬額（税抜）';
      const r = st.mode === 'rev' ? HS.calc.payoutReverse(st.amount, st.taxRate, st.whOnGross) : HS.calc.payout(st.amount, st.taxRate, st.whOnGross);
      const whBase = st.whOnGross ? r.gross : r.base;
      const formula = whBase <= 1000000
        ? yen(whBase) + '円 × 10.21% = ' + yen(r.wh) + '円'
        : '(' + yen(whBase) + '円 − 100万円) × 20.42% + 102,100円 = ' + yen(r.wh) + '円';
      res.innerHTML =
        '<div class="card tool-out">' +
        (st.mode === 'rev' ? '<div class="big-kv"><span>請求する報酬額（税抜）</span><b>' + yen(r.base) + '<small>円</small></b></div>' : '') +
        '<table class="kv"><tbody>' +
        '<tr><th>報酬額（税抜）</th><td>' + yen(r.base) + '円</td></tr>' +
        '<tr><th>消費税（' + st.taxRate + '%）</th><td>' + yen(r.tax) + '円</td></tr>' +
        '<tr><th>請求額（税込）</th><td>' + yen(r.gross) + '円</td></tr>' +
        '<tr class="is-minus"><th>源泉徴収税額</th><td>−' + yen(r.wh) + '円</td></tr>' +
        '<tr class="is-total"><th>実際の振込額</th><td>' + yen(r.net) + '円</td></tr>' +
        '</tbody></table>' +
        '<p class="formula">計算式：' + formula + '（1円未満切り捨て）</p>' +
        '<a class="btn btn-primary" href="' + (HS.site ? HS.site.base : './') + '">この金額で請求書を作る →</a>' +
        '</div>';
    }
    fill();
    form.addEventListener('input', U.debounce(render, 100));
    form.addEventListener('change', render);
    render();
  }

  // ---------------- 収入印紙 ----------------
  function mountInshi(root) {
    const st = Object.assign({ amount: '55000', taxShown: true, business: true }, HS.store.get('inshi', null) || {});
    root.classList.add('tool');
    root.innerHTML =
      '<div class="tool-grid"><form class="tool-form card" onsubmit="return false">' +
      '<label class="f"><span class="f-label">領収書に書く金額（税込）</span><input class="in num in-xl" name="amount" inputmode="numeric" placeholder="55,000"></label>' +
      '<label class="tg"><input type="checkbox" name="taxShown"><span class="tg-ui"></span><span class="tg-label">消費税額（または税抜金額）を領収書に分けて書く</span></label>' +
      '<label class="tg"><input type="checkbox" name="business"><span class="tg-ui"></span><span class="tg-label">事業（営業）としての受け取り</span></label>' +
      '<p class="hint">医師・弁護士・税理士など営業に当たらない業務や、個人が私物を売った場合などは非課税です。</p>' +
      '</form><div class="tool-result" data-role="result" aria-live="polite"></div></div>';
    const form = root.querySelector('form');
    const res = root.querySelector('[data-role="result"]');
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === 'checkbox') el.checked = !!st[el.name];
      else el.value = st[el.name];
    });
    function render() {
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        st[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      });
      HS.store.set('inshi', st);
      const gross = Math.floor(U.num(st.amount));
      const base = st.taxShown ? Math.floor((gross * 100) / 110) : gross;
      const fee = st.business ? HS.calc.stampDuty(base) : 0;
      res.innerHTML =
        '<div class="card tool-out">' +
        '<div class="big-kv"><span>必要な収入印紙</span><b>' + (fee ? yen(fee) + '<small>円</small>' : '不要') + '</b></div>' +
        '<table class="kv"><tbody><tr><th>判定に使う金額</th><td>' + yen(base) + '円' + (st.taxShown ? '（税抜）' : '（税込）') + '</td></tr></tbody></table>' +
        '<p class="callout"><b>PDFやメールで送る領収書には印紙は不要</b>です（紙を作成・交付していないため）。紙で渡すときだけ貼って消印します。</p>' +
        (!st.taxShown && gross >= 50000 && Math.floor((gross * 100) / 110) < 50000
          ? '<p class="callout is-tip">消費税額を分けて書くと判定額が ' + yen(Math.floor((gross * 100) / 110)) + '円 になり、印紙が不要になります。</p>'
          : '') +
        '<a class="btn btn-primary" href="' + (HS.site ? HS.site.base : './') + 'receipt/">領収書を作る →</a>' +
        '</div>';
    }
    form.addEventListener('input', U.debounce(render, 100));
    form.addEventListener('change', render);
    render();
  }

  HS.tools = { mountCtax, mountGensen, mountInshi, bars };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- site.js ---- */
/* ひとり請求書 — Web版サイトの起動処理（広告・アフィリエイト・ツールのマウント） */
(function (g) {
  'use strict';
  const HS = (g.HS = g.HS || {});
  const U = HS.util;
  const M = HS.model;
  const CFG = g.HS_CONFIG || {};
  const base = document.documentElement.dataset.base || './';

  function webNumber(doc) {
    const T = M.TYPES[doc.type];
    return T.prefix + '-' + (doc.issueDate || U.ymd()).replace(/-/g, '');
  }

  function mountEditor(el) {
    const type = el.dataset.type || 'invoice';
    const profile = HS.profile.load();
    let doc = HS.store.get('draft:web', null);
    if (doc && doc.items) {
      doc = M.mergeDefaults(M.newDoc(doc.type, profile), doc);
      if (doc.type !== type) {
        doc.type = type;
        if (doc._autoNo) doc.number = webNumber(doc);
        M.applyTypeDefaults(doc, profile);
      }
    } else {
      doc = M.newDoc(type, profile);
      doc.number = webNumber(doc);
      doc._autoNo = true;
    }
    const ed = new HS.Editor(el, {
      edition: 'web',
      doc,
      profile,
      onDocChange: (d) => HS.store.set('draft:web', d),
      autoNumber: (editor) => {
        editor.doc.number = webNumber(editor.doc);
        editor.doc._autoNo = true;
        editor.fillAll(editor.root.querySelector('[data-k="d.number"]').parentNode);
      },
      onTypeSwitch: (to) => {
        // URL を書類の種類に合わせる（ページ遷移はしない）
        const paths = { invoice: '', estimate: 'estimate/', delivery: 'delivery/', receipt: 'receipt/' };
        try {
          const url = new URL(base + paths[to], location.href);
          history.replaceState(null, '', url.pathname);
        } catch (e) { /* noop */ }
        return true;
      },
      onBeforePrint: (d) => {
        HS.store.set('draft:web', d);
        const n = (HS.store.get('printCount', 0) || 0) + 1;
        HS.store.set('printCount', n);
        if (n === 3 || n === 10) setTimeout(showProNudge, 1500);
      }
    });
    const header = document.querySelector('.site-header');
    if (header) el.style.setProperty('--ed-top', header.offsetHeight + 'px');
    HS.editor = ed;
  }

  function showProNudge() {
    if (!CFG.proUrl) return;
    U.toast('書類の保存・取引先の登録・入金管理ができる「Pro版（買い切り）」もあります');
  }

  // ---- アフィリエイト ----
  function renderAffiliates(scope) {
    (scope || document).querySelectorAll('[data-aff]').forEach((box) => {
      if (box.dataset.done) return;
      const list = (CFG.affiliates && CFG.affiliates[box.dataset.aff]) || [];
      if (!list.length) return;
      box.dataset.done = '1';
      const anyAd = list.some((a) => a.affiliate);
      box.classList.add('aff');
      box.innerHTML =
        (box.dataset.affTitle ? '<div class="aff-h">' + U.esc(box.dataset.affTitle) + (anyAd ? '<span class="pr">PR</span>' : '') + '</div>' : '') +
        '<div class="aff-list">' +
        list
          .map(
            (a) =>
              '<a class="aff-item" href="' + U.esc(a.url) + '" target="_blank" rel="' + (a.affiliate ? 'sponsored ' : '') + 'noopener">' +
              '<span class="aff-name">' + U.esc(a.name) + (a.affiliate && !box.dataset.affTitle ? '<span class="pr">PR</span>' : '') + '</span>' +
              '<span class="aff-desc">' + U.esc(a.desc) + '</span>' +
              '<span class="aff-cta">' + U.esc(a.cta || '詳しく見る') + ' →</span></a>'
          )
          .join('') +
        '</div>';
      box.addEventListener('click', (e) => {
        const a = e.target.closest('a.aff-item');
        if (a && g.gtag) g.gtag('event', 'affiliate_click', { link_url: a.href, aff_group: box.dataset.aff });
      });
    });
  }

  // ---- 広告（AdSense 設定時のみ） ----
  function renderAds() {
    if (!CFG.adsenseClient) return;
    document.querySelectorAll('.ad-slot').forEach((slot) => {
      const id = (CFG.adsenseSlots || {})[slot.dataset.slot || 'content'];
      if (!id) return;
      slot.innerHTML =
        '<span class="ad-label">スポンサーリンク</span><ins class="adsbygoogle" style="display:block" data-ad-client="' + U.esc(CFG.adsenseClient) +
        '" data-ad-slot="' + U.esc(id) + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      try {
        (g.adsbygoogle = g.adsbygoogle || []).push({});
      } catch (e) { /* noop */ }
    });
  }

  // ---- Pro 導線 ----
  function renderPro() {
    document.querySelectorAll('[data-pro-link]').forEach((a) => {
      if (CFG.proUrl) {
        a.href = CFG.proUrl;
        a.target = '_blank';
        a.rel = 'noopener';
      }
    });
    document.querySelectorAll('[data-pro-only]').forEach((el) => (el.hidden = !CFG.proUrl));
    document.querySelectorAll('[data-pro-soon]').forEach((el) => (el.hidden = !!CFG.proUrl));
    document.querySelectorAll('[data-trial-link]').forEach((a) => {
      if (CFG.trialUrl) a.href = CFG.trialUrl;
      else a.hidden = true;
    });
    document.querySelectorAll('[data-pro-price]').forEach((el) => (el.textContent = CFG.proPrice || ''));
  }

  function nav() {
    const btn = document.querySelector('.nav-toggle');
    const menu = document.getElementById('site-nav');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('is-open', open);
    });
  }

  function sw() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    g.addEventListener('load', () => navigator.serviceWorker.register(base + 'sw.js').catch(() => {}));
  }

  function boot() {
    nav();
    renderPro();
    document.querySelectorAll('[data-app="editor"]').forEach(mountEditor);
    document.querySelectorAll('[data-app="ctax"]').forEach((el) => HS.tools.mountCtax(el));
    document.querySelectorAll('[data-app="gensen"]').forEach((el) => HS.tools.mountGensen(el));
    document.querySelectorAll('[data-app="inshi"]').forEach((el) => HS.tools.mountInshi(el));
    renderAffiliates();
    renderAds();
    sw();
  }

  HS.site = { base, renderAffiliates };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
