import * as XLSX from "xlsx";
async function reportDuplicateHash(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function reportLookupFields(row) {
  return {
    equipmentHistoryKeys: equipmentNamesFromRecord(row),
    reportDuplicateHash: await reportDuplicateHash(makeMaintenanceReportDuplicateKey(row)),
  };
}

function toLocalDateText(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDate(dateString) {
  if (!dateString) return null;
  if (dateString instanceof Date && !Number.isNaN(dateString.getTime())) {
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const text = String(dateString).trim().replace(/\//g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);

  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

function isExcelFakeDate(value) {
  if (value === undefined || value === null || value === "" || value === 0 || value === "0") return true;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear() <= 1900;
  const text = String(value).trim();
  if (!text) return true;
  return /(^|[^0-9])(1899|1900)[\/\-.年]/.test(text);
}

function normalizeDateTime(value) {
  if (value === undefined || value === null || value === "" || value === 0) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (value.getFullYear() <= 1900) return "";
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    const hh = String(value.getHours()).padStart(2, "0");
    const mi = String(value.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  // Excel serial date/time number support.
  // Example: 46189.354166 -> 2026-06-16T08:30
  if (typeof value === "number") {
    if (value <= 0) return "";
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || parsed.y <= 1900) return "";
    const yyyy = parsed.y;
    const mm = String(parsed.m).padStart(2, "0");
    const dd = String(parsed.d).padStart(2, "0");
    const hh = String(parsed.H || 0).padStart(2, "0");
    const mi = String(parsed.M || 0).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const text = String(value).trim();
  if (!text || text === "0") return "";
  if (/^(1899|1900)[\/\-.年]/.test(text)) return "";

  // Excel may return strings like 2026/06/16 8:30, 2026-06-16 08:30, 2026年6月16日 8:30
  const normalized = text
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\./g, "-")
    .replace(/\//g, "-")
    .replace(/[時]/g, ":")
    .replace(/[分]/g, "")
    .replace(/\s+/g, " ");

  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const yyyy = match[1];
    const mm = String(match[2]).padStart(2, "0");
    const dd = String(match[3]).padStart(2, "0");
    const hh = String(match[4] || "0").padStart(2, "0");
    const mi = String(match[5] || "0").padStart(2, "0");

    const validDate = parseLocalDate(`${yyyy}-${mm}-${dd}`);
    const hourNumber = Number(hh);
    const minuteNumber = Number(mi);
    if (!validDate || hourNumber > 23 || minuteNumber > 59) return "";

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const parsed = new Date(normalized.replace(" ", "T"));
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeDateTime(parsed);
  }

  return normalized.replace(" ", "T").slice(0, 16);
}

const EQUIPMENT_CATALOG = [{"group":"1G","line":"53-300","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"53-300","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"53-300","equipment":"箱替え機","note":""},{"group":"1G","line":"53-300","equipment":"空気清浄機","note":""},{"group":"1G","line":"53-300","equipment":"スクラップコンベア","note":""},{"group":"1G","line":"57-200","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"57-200","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"57-200","equipment":"箱替え機","note":""},{"group":"1G","line":"65-300","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"65-300","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"65-300","equipment":"箱替え機","note":""},{"group":"1G","line":"71-300","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"71-300","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"71-300","equipment":"箱替え機","note":""},{"group":"1G","line":"83-300","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"83-300","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"83-300","equipment":"箱替え機","note":""},{"group":"1G","line":"89-400","equipment":"プレス","note":"周辺装置・フィード、金型も「プレス」にしている（ワーク反転が多い）"},{"group":"1G","line":"89-400","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"89-400","equipment":"トランスファフィーダー","note":"現状入力なし（フィンガーとか分ける？？）"},{"group":"1G","line":"89-400","equipment":"LE検査機","note":"LE検査機"},{"group":"1G","line":"90-600","equipment":"プレス","note":"周辺装置・金型も「プレス」にしている"},{"group":"1G","line":"90-600","equipment":"レベラー","note":"レベラー・アンコイラー"},{"group":"1G","line":"90-600","equipment":"トランスファフィーダー","note":"こっちは分けている・・・"},{"group":"1G","line":"90-600","equipment":"塗油装置","note":"扶桑精機のやつで分けている"},{"group":"1G","line":"94-300","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"94-300","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"94-300","equipment":"スライダー整列機","note":"1箱切り替えの箱替え機も込み（同じ操作盤）"},{"group":"1G","line":"95-300","equipment":"プレス","note":"段取りローラー、QDCはプレス"},{"group":"1G","line":"95-300","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"1G","line":"95-300","equipment":"箱替え機","note":""},{"group":"1G","line":"RL-5","equipment":"60-060","note":""},{"group":"1G","line":"RL-5","equipment":"61-060","note":""},{"group":"1G","line":"RL-5","equipment":"62-060","note":""},{"group":"1G","line":"RL-5","equipment":"63-060","note":""},{"group":"1G","line":"RL-5","equipment":"64-080","note":""},{"group":"1G","line":"RL-5","equipment":"搬送ロボット","note":"アーム、ロボット"},{"group":"1G","line":"RL-5","equipment":"ブランクフィーダー","note":"フローター、スタッカー"},{"group":"1G","line":"RL-5","equipment":"D6かしめ機","note":""},{"group":"1G","line":"RL-5","equipment":"D9Cかしめ機","note":""},{"group":"1G","line":"RL-5","equipment":"D9Cねじ切り機","note":""},{"group":"1G","line":"RL-5","equipment":"D12かしめ機","note":""},{"group":"1G","line":"RL-5","equipment":"4859かしめ機","note":""},{"group":"1G","line":"キャップねじ切り機","equipment":"6号機","note":""},{"group":"1G","line":"キャップねじ切り機","equipment":"7号機","note":""},{"group":"1G","line":"洗浄","equipment":"2号機","note":""},{"group":"1G","line":"TPS03","equipment":"ねじ切り機","note":""},{"group":"1G","line":"A棟スクラップコンベア","equipment":"制御盤","note":""},{"group":"1G","line":"A棟スクラップコンベア","equipment":"№1","note":"PMXライン下"},{"group":"1G","line":"A棟スクラップコンベア","equipment":"№2","note":"南側→№1のライン"},{"group":"1G","line":"A棟スクラップコンベア","equipment":"№3","note":"89、94、90のライン"},{"group":"1G","line":"ホイストクレーン","equipment":"A棟1階東","note":""},{"group":"1G","line":"ホイストクレーン","equipment":"A棟1階中央","note":""},{"group":"1G","line":"ホイストクレーン","equipment":"A棟1階西","note":""},{"group":"1G","line":"A棟自動倉庫","equipment":"クレーン","note":""},{"group":"1G","line":"A棟自動倉庫","equipment":"荷受台","note":"№1（1G）、№2（工機）"},{"group":"1G","line":"6182・6239かしめ機","equipment":"D10かしめ機","note":"旧2Gエリア（A棟2F）　1G管轄"},{"group":"1G","line":"4F補給設備","equipment":"BIGかしめ機","note":"C棟4F"},{"group":"1G","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、ニブラ等"},{"group":"3G","line":"30-060","equipment":"プレス","note":"プロテクタのスクラップシュートもプレス"},{"group":"3G","line":"30-060","equipment":"レベラー","note":"レベラー・アンコイラー"},{"group":"3G","line":"30-060","equipment":"フィーダー","note":"ダイマック"},{"group":"3G","line":"30-060","equipment":"箱替え機","note":""},{"group":"3G","line":"41-200","equipment":"プレス","note":""},{"group":"3G","line":"41-200","equipment":"搬送ロボット","note":"アーム、ロボット"},{"group":"3G","line":"41-200","equipment":"ブランクフィーダー","note":"フローター、スタッカー"},{"group":"3G","line":"41-200","equipment":"箱替え機","note":""},{"group":"3G","line":"42-250","equipment":"プレス","note":"銅のスクラップシュートもプレス"},{"group":"3G","line":"42-250","equipment":"レベラー","note":"レベラー・アンコイラー"},{"group":"3G","line":"42-250","equipment":"箱替え機","note":""},{"group":"3G","line":"49-060","equipment":"プレス","note":""},{"group":"3G","line":"49-060","equipment":"フィーダー","note":"ダイマック"},{"group":"3G","line":"49-060","equipment":"アンコイラー","note":""},{"group":"3G","line":"49-060","equipment":"箱替え機","note":""},{"group":"3G","line":"51-110","equipment":"プレス","note":""},{"group":"3G","line":"51-110","equipment":"フィーダー","note":"シリンダー機構のやつ、ケースのカタカタ供給シュート"},{"group":"3G","line":"51-110","equipment":"アンコイラー","note":""},{"group":"3G","line":"51-110","equipment":"搬送ロボット","note":""},{"group":"3G","line":"51-110","equipment":"箱替え機","note":""},{"group":"3G","line":"70-080","equipment":"プレス","note":""},{"group":"3G","line":"70-080","equipment":"D12パケトレかしめ機","note":""},{"group":"3G","line":"72-160","equipment":"プレス","note":""},{"group":"3G","line":"72-160","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"3G","line":"72-160","equipment":"箱替え機","note":""},{"group":"3G","line":"76-060","equipment":"プレスかしめ機","note":"プレス・かしめ機"},{"group":"3G","line":"76-060","equipment":"TPS05","note":"ねじ切り機"},{"group":"3G","line":"78-060","equipment":"プレスかしめ機","note":"プレス・かしめ機"},{"group":"3G","line":"78-060","equipment":"TPS04","note":"ねじ切り機"},{"group":"3G","line":"82-045","equipment":"プレス","note":"プレス・治具関係"},{"group":"3G","line":"87-400","equipment":"プレス","note":"QDCはプレス　BSコンベアもプレス？"},{"group":"3G","line":"87-400","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"3G","line":"87-400","equipment":"箱替え機","note":""},{"group":"3G","line":"88-400","equipment":"プレス","note":"段取りローラー・QDC・スクラップシュートはプレス"},{"group":"3G","line":"88-400","equipment":"レベラー","note":"レベラー・アンコイラー・塗油装置"},{"group":"3G","line":"88-400","equipment":"箱替え機","note":""},{"group":"3G","line":"91-200","equipment":"プレス","note":""},{"group":"3G","line":"91-200","equipment":"レベラー","note":"レベラー・アンコイラー"},{"group":"3G","line":"91-200","equipment":"箱替え機","note":""},{"group":"3G","line":"CY","equipment":"ねじ切り1号機","note":""},{"group":"3G","line":"CY","equipment":"ねじ切り2号機","note":""},{"group":"3G","line":"CY","equipment":"洗浄4号機","note":""},{"group":"3G","line":"CY","equipment":"箱替え機","note":"洗浄出口の光電センサも箱替え機"},{"group":"3G","line":"RL-1","equipment":"66-060","note":""},{"group":"3G","line":"RL-1","equipment":"67-060","note":""},{"group":"3G","line":"RL-1","equipment":"68-060","note":""},{"group":"3G","line":"RL-1","equipment":"69-060","note":""},{"group":"3G","line":"RL-1","equipment":"搬送ロボット","note":"アーム、ロボット"},{"group":"3G","line":"RL-1","equipment":"ブランクフィーダー","note":"フローター、スタッカー"},{"group":"3G","line":"RL-1","equipment":"D9かしめ機","note":""},{"group":"3G","line":"RL-1","equipment":"D9ねじ切り機","note":""},{"group":"3G","line":"RL-1","equipment":"D10かしめ機","note":""},{"group":"3G","line":"RL-1","equipment":"D12ジャイロかしめ機","note":""},{"group":"3G","line":"RL-3","equipment":"55-060","note":""},{"group":"3G","line":"RL-3","equipment":"56-060","note":""},{"group":"3G","line":"RL-3","equipment":"59-080","note":""},{"group":"3G","line":"RL-3","equipment":"搬送ロボット","note":"アーム、ロボット"},{"group":"3G","line":"RL-3","equipment":"ブランクフィーダー","note":"フローター、スタッカー"},{"group":"3G","line":"RL-3","equipment":"D13ねじ切り機","note":""},{"group":"3G","line":"RL-3","equipment":"D13かしめ機","note":""},{"group":"3G","line":"RL-4","equipment":"84-060","note":""},{"group":"3G","line":"RL-4","equipment":"85-060","note":""},{"group":"3G","line":"RL-4","equipment":"86-080","note":""},{"group":"3G","line":"RL-4","equipment":"搬送ロボット","note":"アーム、ロボット"},{"group":"3G","line":"RL-4","equipment":"ブランクフィーダー","note":"フローター、スタッカー"},{"group":"3G","line":"RL-4","equipment":"D11ねじ切り機","note":""},{"group":"3G","line":"RL-4","equipment":"D11かしめ機","note":""},{"group":"3G","line":"RL-4","equipment":"D14ねじ切り機","note":""},{"group":"3G","line":"RL-4","equipment":"D16かしめねじ切り機","note":""},{"group":"3G","line":"RMI-01","equipment":"樹脂成型機","note":""},{"group":"3G","line":"RMI-01","equipment":"乾燥機","note":""},{"group":"3G","line":"RMI-01","equipment":"チラー","note":""},{"group":"3G","line":"RMI-01","equipment":"その他","note":""},{"group":"3G","line":"キャップ旋盤","equipment":"8号機","note":""},{"group":"3G","line":"キャップ旋盤","equipment":"9号機","note":""},{"group":"3G","line":"キャップ旋盤","equipment":"10号機","note":""},{"group":"3G","line":"B棟スクラップコンベア","equipment":"制御盤","note":"RL側、順送側"},{"group":"3G","line":"B棟スクラップコンベア","equipment":"№1","note":"RL-3→87・88間→A棟の東西メインのライン"},{"group":"3G","line":"B棟スクラップコンベア","equipment":"№2","note":"RLラインを周回しているライン"},{"group":"3G","line":"B棟スクラップコンベア","equipment":"№3","note":"中央エリアを周回しているライン"},{"group":"3G","line":"B棟スクラップコンベア","equipment":"№4","note":"72→88→№1の南北ライン"},{"group":"3G","line":"B棟スクラップコンベア","equipment":"№5","note":"87-400用90度カーブしているライン"},{"group":"3G","line":"ホイストクレーン","equipment":"B棟1階東","note":""},{"group":"3G","line":"ホイストクレーン","equipment":"B棟1階中央","note":""},{"group":"3G","line":"ホイストクレーン","equipment":"B棟1階西","note":""},{"group":"3G","line":"4F補給設備","equipment":"D11ガイドシャフトねじ切り機","note":""},{"group":"3G","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、ニブラ等"},{"group":"4G","line":"きよちゃん","equipment":"溶接機","note":""},{"group":"4G","line":"きよちゃん","equipment":"ナットフィーダー","note":""},{"group":"4G","line":"きよちゃん","equipment":"その他","note":"チラー、排出シュート等"},{"group":"4G","line":"かなちゃん","equipment":"溶接機","note":""},{"group":"4G","line":"かなちゃん","equipment":"ナットフィーダー","note":"2台設置"},{"group":"4G","line":"かなちゃん","equipment":"その他","note":"チラー、排出シュート等"},{"group":"4G","line":"ゆきちゃん","equipment":"溶接機","note":""},{"group":"4G","line":"ゆきちゃん","equipment":"ナットフィーダー","note":"2台設置"},{"group":"4G","line":"ゆきちゃん","equipment":"その他","note":"チラー、排出シュート等"},{"group":"4G","line":"PWI01-90","equipment":"溶接機","note":"インバーター（油持ち込みNG）"},{"group":"4G","line":"PWI01-90","equipment":"ベースねじ切り機","note":"ブラザー（油持ち込みNG）"},{"group":"4G","line":"PWA01-50","equipment":"溶接機","note":""},{"group":"4G","line":"PWA01-50","equipment":"ナットフィーダー","note":"ミヤマ製"},{"group":"4G","line":"AHS02-07","equipment":"汎用かしめ機","note":""},{"group":"4G","line":"すみちゃん","equipment":"溶接機","note":"旧2Gエリア（A棟2F）　4G管轄"},{"group":"4G","line":"すみちゃん","equipment":"自動排出装置","note":"旧2Gエリア（A棟2F）　4G管轄"},{"group":"4G","line":"たかちゃん","equipment":"溶接機","note":"旧2Gエリア（A棟2F）　4G管轄"},{"group":"4G","line":"TB-1","equipment":"溶接ロボット","note":""},{"group":"4G","line":"TB-1","equipment":"溶接治具","note":""},{"group":"4G","line":"TB-1","equipment":"ハイスピンかしめ機","note":""},{"group":"4G","line":"TB-2","equipment":"圧入機","note":"観覧車も含む"},{"group":"4G","line":"TB-3","equipment":"圧入機","note":"観覧車も含む"},{"group":"4G","line":"TB-4","equipment":"グリス塗布","note":""},{"group":"4G","line":"TB-4","equipment":"スプリング組付け","note":""},{"group":"4G","line":"TB-4","equipment":"圧入機","note":"観覧車も含む"},{"group":"4G","line":"TB-5","equipment":"溶接機","note":""},{"group":"4G","line":"TB-5","equipment":"ハイスピンかしめ機","note":""},{"group":"4G","line":"TB-6","equipment":"溶接ロボット","note":""},{"group":"4G","line":"TB-6","equipment":"溶接治具","note":""},{"group":"4G","line":"TB-6","equipment":"ハイスピンかしめ機","note":"インデックス全行程"},{"group":"4G","line":"TB-7","equipment":"圧入機","note":""},{"group":"4G","line":"TB-8","equipment":"ハイスピンかしめ機","note":""},{"group":"4G","line":"TB-8","equipment":"シールはがし","note":""},{"group":"4G","line":"TR-1","equipment":"RT2かしめ1号機","note":"串替え機も込み"},{"group":"4G","line":"TR-1","equipment":"RT2かしめ2号機","note":""},{"group":"4G","line":"TK-1","equipment":"溶接ロボット","note":"ロボット、トーチ関係、ガス関係など"},{"group":"4G","line":"TK-1","equipment":"溶接機左側","note":"治具、カーテン、排出など"},{"group":"4G","line":"TK-1","equipment":"溶接機右側","note":"治具、カーテン、排出など"},{"group":"4G","line":"TK-1","equipment":"スプリンク組付け","note":""},{"group":"4G","line":"TK-1","equipment":"ハイスピンかしめ機","note":""},{"group":"4G","line":"TK-2","equipment":"グリス塗布ロータリーかしめ機①","note":"ドラムフィーダー含む"},{"group":"4G","line":"TK-2","equipment":"グリス塗布ロータリーかしめ機②","note":"ドラムフィーダー含む"},{"group":"4G","line":"TK-2","equipment":"グリス塗布ロータリーかしめ機③","note":"ドラムフィーダー×2含む"},{"group":"4G","line":"TK-2","equipment":"画像検査","note":""},{"group":"4G","line":"24-045","equipment":"プレス","note":""},{"group":"4G","line":"4F補給設備","equipment":"○○","note":""},{"group":"4G","line":"集塵機","equipment":"№1","note":""},{"group":"4G","line":"集塵機","equipment":"№2","note":""},{"group":"4G","line":"集塵機","equipment":"№3","note":""},{"group":"4G","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、グリスルブリケータ等"},{"group":"5G","line":"NB","equipment":"ロッキング組付け","note":""},{"group":"5G","line":"NB","equipment":"リベットかしめ機","note":""},{"group":"5G","line":"NF","equipment":"刻印機","note":""},{"group":"5G","line":"NI","equipment":"刻印機","note":""},{"group":"5G","line":"NJ","equipment":"グリス塗布機","note":""},{"group":"5G","line":"NJ","equipment":"ロッキング組付け","note":""},{"group":"5G","line":"NJ","equipment":"リベットかしめ機","note":""},{"group":"5G","line":"NJ","equipment":"刻印機","note":""},{"group":"5G","line":"NJ","equipment":"ボルト組付け","note":""},{"group":"5G","line":"NK","equipment":"整列機","note":""},{"group":"5G","line":"NK","equipment":"スライダーASSY","note":""},{"group":"5G","line":"NK","equipment":"ロッキングASSY","note":""},{"group":"5G","line":"NK","equipment":"ベースASSY","note":""},{"group":"5G","line":"NK","equipment":"メイン制御盤","note":""},{"group":"5G","line":"NK","equipment":"刻印機右側","note":""},{"group":"5G","line":"NK","equipment":"刻印機左側","note":""},{"group":"5G","line":"NL","equipment":"スライダー整列機","note":""},{"group":"5G","line":"NL","equipment":"スライダーASSY","note":""},{"group":"5G","line":"NL","equipment":"ロッキングASSY","note":""},{"group":"5G","line":"NL","equipment":"ベースASSY","note":"スライダー搬送（移送）治具、シュー挿入工程はベースASSY"},{"group":"5G","line":"NL","equipment":"メイン制御盤","note":""},{"group":"5G","line":"NL","equipment":"刻印機右側","note":""},{"group":"5G","line":"NL","equipment":"刻印機左側","note":""},{"group":"5G","line":"NL","equipment":"箱詰め装置","note":""},{"group":"5G","line":"TC","equipment":"ピンアジャスタ組付け","note":""},{"group":"5G","line":"TC","equipment":"スプリング組付け","note":""},{"group":"5G","line":"TC","equipment":"カバー組付け","note":""},{"group":"5G","line":"TC","equipment":"リベットかしめ機","note":"搬送→挿入→カメラ→かしめ"},{"group":"5G","line":"TC","equipment":"切り起こし工程","note":""},{"group":"5G","line":"TC","equipment":"刻印機","note":""},{"group":"5G","line":"4F補給設備","equipment":"○○","note":""},{"group":"5G","line":"ホイストクレーン","equipment":"C棟3階","note":""},{"group":"5G","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、グリスルブリケータ等"},{"group":"6G","line":"G0","equipment":"ブッシュ圧入機","note":""},{"group":"6G","line":"G0","equipment":"スプールピン圧入機","note":""},{"group":"6G","line":"G0","equipment":"センサーCP圧入機","note":""},{"group":"6G","line":"G0","equipment":"スプリング巻き機","note":""},{"group":"6G","line":"G0","equipment":"スプリングCP圧入機","note":""},{"group":"6G","line":"G0","equipment":"グリス塗布機","note":""},{"group":"6G","line":"G0","equipment":"画像検査","note":"注射器含む"},{"group":"6G","line":"G0","equipment":"カム圧入機","note":""},{"group":"6G","line":"G0","equipment":"カバーセンサー圧入機","note":""},{"group":"6G","line":"G0","equipment":"QR印刷機","note":""},{"group":"6G","line":"G0","equipment":"ソレノイドCP圧入機","note":""},{"group":"6G","line":"G0","equipment":"ソレノイドCP用スプールピン圧入機","note":""},{"group":"6G","line":"G1S","equipment":"ブッシュ圧入機","note":""},{"group":"6G","line":"G1S","equipment":"スプールピン圧入機","note":""},{"group":"6G","line":"G1S","equipment":"センサーCP圧入機","note":""},{"group":"6G","line":"G1S","equipment":"スプリング巻き機","note":""},{"group":"6G","line":"G1S","equipment":"スプリングCP圧入機","note":""},{"group":"6G","line":"G1S","equipment":"グリス塗布機","note":""},{"group":"6G","line":"G1S","equipment":"画像検査","note":""},{"group":"6G","line":"G1S","equipment":"カム圧入機","note":""},{"group":"6G","line":"G1S","equipment":"カバーセンサー圧入機","note":""},{"group":"6G","line":"G1S","equipment":"QR印刷機","note":""},{"group":"6G","line":"LO1","equipment":"ボタンコネクタ組付治具","note":""},{"group":"6G","line":"LO1","equipment":"誤組付け確認機","note":""},{"group":"6G","line":"LO1","equipment":"カバーピン圧入機","note":""},{"group":"6G","line":"LO1","equipment":"刻印機","note":""},{"group":"6G","line":"LO1","equipment":"着脱確認","note":"手でやるやつ"},{"group":"6G","line":"LO2","equipment":"ボタンコネクタ組付治具","note":""},{"group":"6G","line":"LO2","equipment":"誤組付け確認機","note":""},{"group":"6G","line":"LO2","equipment":"カバーピン圧入機","note":"A/B"},{"group":"6G","line":"LO2","equipment":"着脱確認刻印機","note":""},{"group":"6G","line":"LO3","equipment":"19-010","note":""},{"group":"6G","line":"TR-2","equipment":"D11ガイドシャフトかしめ機","note":"※6Gエリアにあり"},{"group":"6G","line":"TR-3","equipment":"バーサポートかしめ機","note":""},{"group":"6G","line":"TR-3","equipment":"シャフト圧入機","note":""},{"group":"6G","line":"TR-3","equipment":"スプリングCP巻き装置","note":""},{"group":"6G","line":"TR-3","equipment":"スプリングCPギボシ圧入機","note":""},{"group":"6G","line":"TR-3","equipment":"画像検査機","note":""},{"group":"6G","line":"TR-3","equipment":"カバーセンサー圧入機","note":""},{"group":"6G","line":"TR-3","equipment":"カバーリトラクタ圧入機","note":""},{"group":"6G","line":"TR-3","equipment":"ボルト締め付け装置","note":""},{"group":"6G","line":"補給設備","equipment":"○○","note":"4Fと6Gエリアの補給設備"},{"group":"6G","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、グリスルブリケータ等"},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックA","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックB","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックC","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックE","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックF","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックG","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックI","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックJ","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックK","note":""},{"group":"工機","line":"保全作業台","equipment":"チェーンブロックL","note":"象印製移動式"},{"group":"工機","line":"ホイストクレーン","equipment":"A棟3階東","note":""},{"group":"工機","line":"ホイストクレーン","equipment":"A棟3階西南","note":"ワイヤーカット室側"},{"group":"工機","line":"ホイストクレーン","equipment":"A棟3階西北","note":"金型保全台側"},{"group":"工機","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、工作機械等"},{"group":"工務","line":"B棟自動倉庫","equipment":"クレーン","note":""},{"group":"工務","line":"B棟自動倉庫","equipment":"荷受台","note":"№1、№2（工務）、№3（5G・6G）、№4（4階工務）"},{"group":"工務","line":"ホイストクレーン","equipment":"C棟1階","note":""},{"group":"工務","line":"その他","equipment":"○○","note":"建屋照明、ファクトライン、フォークリフト等"},{"group":"第二工場","line":"ホイストクレーン","equipment":"第二工場","note":""},{"group":"第二工場","line":"その他","equipment":"○○","note":"建屋照明、電気設備、工作機械等"},{"group":"DAPAC","line":"23-060","equipment":"プレス","note":""},{"group":"DAPAC","line":"23-060","equipment":"レベラー","note":""},{"group":"DAPAC","line":"23-060","equipment":"フィーダー","note":""},{"group":"DAPAC","line":"25-045","equipment":"プレス","note":""},{"group":"DAPAC","line":"15-015","equipment":"LOコネクタバーサポートかしめ","note":"プレスはミヤマのじゃない（はず）"},{"group":"DAPAC","line":"16-015","equipment":"LOコネクタバーサポートかしめ","note":"プレスはミヤマのじゃない（はず）"}];

function matchPilotEquipment(value) {
  return String(value ?? "").normalize("NFKC").trim().toUpperCase()
    .replace(/[‐‑–−]/g, "-").replace(/\s*-\s*/g, "-")
    .replace(/^(78|76)-60$/, "$1-060");
}

function equipmentKey(group, line, equipment = "") {
  return "asset:" + JSON.stringify([group, line, equipment]);
}

function parseEquipmentKey(key) {
  try {
    if (key.startsWith("asset:")) {
      const [group, line, equipment] = JSON.parse(key.slice(6));
      return { group, line, equipment };
    }
  } catch {}
  return { group: "", line: "", equipment: key };
}

function equipmentNamesFromRecord(row = {}) {
  const group = String(row.groupName || "").trim();
  let line = String(row.lineName || "").trim();
  let equipment = String(row.equipment || row.machine || row.machineName || row.equipmentName || "").trim();
  const norm = matchPilotEquipment;
  // Legacy reports sometimes put a line code in the equipment field.
  if ((!line || norm(line) === norm(equipment)) && EQUIPMENT_CATALOG.some((item) => norm(item.line) === norm(equipment))) {
    line = equipment; equipment = "";
  }
  if (!line && !equipment) return [];
  if (!line && ["未設定", "設備未設定", "設備名なし", "-", "—"].includes(equipment)) return [];
  const candidates = EQUIPMENT_CATALOG.filter((item) =>
    (!group || norm(item.group) === norm(group)) &&
    (!line || norm(item.line) === norm(line)) &&
    (!equipment || norm(item.equipment) === norm(equipment)));
  const lines = [...new Set(candidates.map((item) => JSON.stringify([item.group, item.line])))];
  if (lines.length === 1) {
    const [g, l] = JSON.parse(lines[0]);
    const exact = candidates.find((item) => norm(item.equipment) === norm(equipment));
    return [...new Set([equipmentKey(g, l), equipmentKey(g, l, exact?.equipment || equipment)])];
  }
  // A known line remains identifiable even when the component is absent from the catalog.
  if (line) {
    const matchingLines = [...new Set(EQUIPMENT_CATALOG.filter(item =>
      norm(item.line) === norm(line) && (!group || norm(item.group) === norm(group)))
      .map(item => equipmentKey(item.group, item.line)))];
    if (matchingLines.length === 1) {
      const [canonicalLineKey] = matchingLines;
      const identity = parseEquipmentKey(canonicalLineKey);
      return [...new Set([canonicalLineKey, equipmentKey(identity.group, identity.line, equipment)])];
    }
  }
  // Do not infer a line for ambiguous equipment names such as プレス.
  return [equipmentKey(group, line, equipment)];
}

function normalizeDuplicateText(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function makeMaintenanceReportDuplicateKey(row = {}) {
  return [
    normalizeDateTime(row.troubleDateTime || row.workStartDateTime || row.createdAt || ""),
    normalizeDuplicateText(row.equipment),
    normalizeDuplicateText(row.lineName),
    normalizeDuplicateText(row.phenomenon),
    normalizeDuplicateText(row.troublePoint),
  ].join("|");
}

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const [projectId] = args;
if (!projectId || projectId.startsWith("--") || args.slice(1).some(arg => arg !== "--apply")) {
  console.error("Uso: node scripts/index-maintenance-reports.mjs PROJECT_ID [--apply]");
  process.exit(1);
}
const apply = args.includes("--apply");
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const firebase = initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() });
const db = getFirestore(firebase);
const reports = db.collection("maintenanceReports");
const base = reports.orderBy(FieldPath.documentId()).limit(200);
let cursor;
let scanned = 0;
let missing = 0;
let changed = 0;
console.log(projectId, emulator || "Firebase", apply ? "gravar índices" : "somente leitura");
try {
  while (true) {
    const page = await (cursor ? base.startAfter(cursor) : base).get();
    if (page.empty) break;
    scanned += page.size;
    for (const doc of page.docs) {
      const row = doc.data();
      const fields = await reportLookupFields(row);
      const differs = row.reportDuplicateHash !== fields.reportDuplicateHash ||
        JSON.stringify(row.equipmentHistoryKeys) !== JSON.stringify(fields.equipmentHistoryKeys);
      if (!differs) continue;
      missing++;
      if (apply) {
        await db.runTransaction(async tx => {
          const current = await tx.get(doc.ref);
          if (current.exists) tx.update(doc.ref, await reportLookupFields(current.data()));
        });
        changed++;
      }
    }
    cursor = page.docs.at(-1);
    console.log({ scanned, missing, changed });
    if (page.size < 200) break;
  }
  console.log({ scanned, missing, changed });
} finally {
  await db.terminate();
}
