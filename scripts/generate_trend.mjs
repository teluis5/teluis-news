import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NEWS_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(NEWS_ROOT, '../..');

// 引数解析
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');
const isAutoPush = args.includes('--auto-push');
const apiKeyArg = args.find(a => a.startsWith('--api-key='))?.split('=')[1];

// APIキーの自動解決 (.secrets/gemini-key.txt も探索)
function resolveApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  if (apiKeyArg) return apiKeyArg.trim();

  const secretPath = path.join(WORKSPACE_ROOT, '.secrets', 'gemini-key.txt');
  if (fs.existsSync(secretPath)) {
    try {
      const content = fs.readFileSync(secretPath, 'utf-8').trim();
      if (content) return content;
    } catch {
      // 無視
    }
  }

  // リポジトリ直下の .secrets も念のため探索
  const localSecretPath = path.join(NEWS_ROOT, '.secrets', 'gemini-key.txt');
  if (fs.existsSync(localSecretPath)) {
    try {
      const content = fs.readFileSync(localSecretPath, 'utf-8').trim();
      if (content) return content;
    } catch {
      // 無視
    }
  }

  return '';
}

const GEMINI_API_KEY = resolveApiKey();

// 今日の日付 (JST)
function getJSTDate() {
  const now = new Date();
  const jstOffset = 9 * 60; // JST: UTC+9
  const localOffset = now.getTimezoneOffset();
  const jstDate = new Date(now.getTime() + (jstOffset + localOffset) * 60 * 1000);
  const yyyy = jstDate.getFullYear();
  const mm = String(jstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(jstDate.getDate()).padStart(2, '0');
  return { yyyy, mm, dd, dateStr: `${yyyy}-${mm}-${dd}`, formattedJa: `${yyyy}年${Number(mm)}月${Number(dd)}日` };
}

function decodeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

// IT・ガジェット・AI 専用キーワード
const TECH_PATTERNS = [
  /\bAI\b/i, /人工知能/i, /ChatGPT/i, /Claude/i, /Gemini/i, /OpenAI/i, /LLM/i, /生成AI/i, /Anthropic/i,
  /Copilot/i, /DeepSeek/i, /機械学習/i, /ディープラーニング/i,
  /iPhone/i, /iPad/i, /MacBook/i, /Apple/i, /Android/i, /Pixel/i, /Galaxy/i, /スマホ/i, /スマートフォン/i,
  /ガジェット/i, /スマートウォッチ/i, /スマートグラス/i, /ウェアラブル/i, /Vision Pro/i, /Meta Quest/i,
  /ノートPC/i, /自作PC/i, /GPU/i, /CPU/i, /NVIDIA/i, /GeForce/i, /Intel/i, /AMD/i, /Ryzen/i, /半導体/i,
  /Windows/i, /Linux/i, /macOS/i, /iOS/i,
  /PlayStation/i, /Nintendo/i, /Switch/i,
  /プログラミング/i, /Python/i, /JavaScript/i, /TypeScript/i, /Rust/i, /GitHub/i, /AWS/i, /Docker/i, /Kubernetes/i,
  /サイバーセキュリティ/i, /マルウェア/i, /ランサムウェア/i, /ゼロデイ/i, /脆弱性/i,
  /自動運転/i, /EV/i, /テスラ/i
];

function isTechQuery(text) {
  return TECH_PATTERNS.some(p => p.test(text));
}

function calculateTechScore(text) {
  let score = 0;
  for (const pattern of TECH_PATTERNS) {
    if (pattern.test(text)) {
      score += 15;
    }
  }
  return score;
}

// 1. はてなブックマーク（テクノロジー人気エントリ）
async function fetchHatenaTechTrends() {
  console.log('📡 はてなブックマーク（テクノロジー）人気RSSを取得中...');
  try {
    const res = await fetch('https://b.hatena.ne.jp/hotentry/it.rss');
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const xml = await res.text();

    const items = [];
    const itemRegex = /<item\b[\s\S]*?<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const content = match[0];
      const title = decodeXml(content.match(/<title>(.*?)<\/title>/)?.[1] || '');
      const link = content.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const countStr = content.match(/<hatena:bookmarkcount>(.*?)<\/hatena:bookmarkcount>/)?.[1] || '0';
      const desc = decodeXml(content.match(/<description>(.*?)<\/description>/)?.[1] || '');
      const image = content.match(/<hatena:imageurl>(.*?)<\/hatena:imageurl>/)?.[1] || null;

      if (title && link) {
        const bookmarks = parseInt(countStr, 10);
        const textToAnalyze = `${title} ${desc}`;
        const techScore = calculateTechScore(textToAnalyze);

        items.push({
          sourceType: 'hatena_tech',
          title,
          link,
          bookmarks,
          description: desc,
          image,
          techScore,
          score: bookmarks + techScore * 4,
          sourceName: 'はてなブックマーク（テクノロジー）'
        });
      }
    }

    items.sort((a, b) => b.score - a.score);
    return items;
  } catch (e) {
    console.warn('⚠️ はてなブックマークの取得に失敗しました:', e.message);
    return [];
  }
}

// 2. Google Trends RSS（急上昇ワード自体がIT・ガジェット・AIの場合のみ）
async function fetchGoogleTrendsTech() {
  console.log('📡 Google Trends (JP) からテック関連急上昇を取得中...');
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=JP');
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const xml = await res.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      const titleMatch = itemContent.match(/<title>(.*?)<\/title>/);
      const trafficMatch = itemContent.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/);
      const pictureMatch = itemContent.match(/<ht:picture>(.*?)<\/ht:picture>/);

      const title = decodeXml(titleMatch ? titleMatch[1] : '');

      if (title && isTechQuery(title)) {
        const newsItems = [];
        const newsRegex = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/g;
        let nMatch;
        while ((nMatch = newsRegex.exec(itemContent)) !== null) {
          const nContent = nMatch[1];
          const nTitle = nContent.match(/<ht:news_item_title>(.*?)<\/ht:news_item_title>/)?.[1] || '';
          const nUrl = nContent.match(/<ht:news_item_url>(.*?)<\/ht:news_item_url>/)?.[1] || '';
          const nSource = nContent.match(/<ht:news_item_source>(.*?)<\/ht:news_item_source>/)?.[1] || '';
          if (nTitle && nUrl) {
            newsItems.push({ title: decodeXml(nTitle), url: nUrl, source: decodeXml(nSource) });
          }
        }

        items.push({
          sourceType: 'google_trends',
          title,
          traffic: trafficMatch ? trafficMatch[1] : '注目',
          picture: pictureMatch ? pictureMatch[1] : null,
          news: newsItems
        });
      }
    }

    return items;
  } catch (e) {
    console.warn('⚠️ Google Trends の取得に失敗しました:', e.message);
    return [];
  }
}

// ギズモード・ジェットストリーム風のGemini API記事執筆
async function generateArticleWithGemini(mainTopic, subTopics, dateInfo) {
  if (!GEMINI_API_KEY) {
    console.log('⚠️ GEMINI_API_KEY が未設定のため、ギズモード風テンプレートの下書きを生成します（--dry-run 相当）。');
    return generateFallbackArticle(mainTopic, subTopics, dateInfo);
  }

  console.log('🤖 Gemini 2.5 Flash で【ギズモード×ジェットストリーム風】の熱量ある記事を執筆中...');

  const mainTopicData = `【メイン特集トピック（最重要）】
タイトル: ${mainTopic.title}
情報源: ${mainTopic.sourceName || '最新ニュース'} (${mainTopic.bookmarks ? mainTopic.bookmarks + 'ブクマ' : mainTopic.traffic})
URL: ${mainTopic.link || mainTopic.news?.[0]?.url || ''}
概要・抜粋: ${mainTopic.description || mainTopic.news?.map(n => n.title).join(' / ') || ''}`;

  const subTopicsData = subTopics.map((t, i) => {
    const url = t.link || t.news?.[0]?.url || '';
    const desc = t.description || t.news?.map(n => n.title).join(' / ') || '';
    return `- トピック${i + 1}: ${t.title} (${url})\n  要約: ${desc}`;
  }).join('\n');

  const systemInstruction = `あなたは「ギズモード・ジャパン（Gizmodo Japan）」や「ジェットストリーム（Jetstream BLOG）」の看板ライターです。
無味乾燥なニュースの要約や定型句の羅列は絶対にしません。
ガジェットやテクノロジー、AIが心から大好きなギークとして、熱量とワクワク感、そして実用的な本音（買いか見送りか、生活はどう変わるか）を読者に語りかける文体で記事を執筆します。

【文体とトーン＆マナー（超重要）】
1. **ギークの熱量と親しみやすさ**:
   - 「〜なんですよね」「〜かもしれません」「これ、地味にめちゃくちゃ便利じゃないですか？」「ガジェット好きなら思わず二度見してしまうやつです」「正直、個人的にも気になって夜しか眠れません」のような、生き生きとした体温のある語り口。
   - 硬い報道調（「〜が明らかになった」「〜とのことである」「今後の動向に注目が集まります」）や、AI臭い陳腐な結び（「いかがでしたでしょうか」）は完全禁止！
2. **読者の知りたい本質を突く**:
   - 単なるスペック紹介ではなく、「結局、僕たちの生活や仕事の何が便利になるのか？」「既存の製品やツールと何が圧倒的に違うのか？」「ロマンやワクワクポイントはどこか？」。
   - デメリットや懸念点（価格、バッテリー、対応環境、まだ未成熟な部分）も正直にツッコミを入れる。
3. **タイトル付けのギズモード流**:
   - 「〇月〇日のトレンドまとめ」のような事務的なタイトルは厳禁！
   - メイン特集の魅力を前面に出し、思わずクリックしたくなるキャッチーなタイトル（32〜45文字程度）にすること。
   - 例: 「〇〇が進化してヤバい。日常タスクが激変しそうな最新AI＆ガジェットまとめ」
   - 例: 「これ1つで全部完結？注目の〇〇発表と、今週押さえておきたいテック話題4選」

【記事構成ルール】
- **Frontmatter**:
  title: キャッチーなギズモード風タイトル
  description: 110〜130文字程度で、読者の好奇心をそそる導入要約
  pubDate: "${dateInfo.dateStr}"
  categories: ["AIトレンド", "ガジェット", "IT・テック"]
  heroImage: "./hero.jpg"
- **導入部**:
  - ガジェット好き・テック好きのテンション高めのプロローグ
  - <ProblemBox> コンポーネントを配置（読者が「まさにそれ気になってた！」と思うリアルな疑問や物欲・課題を3〜4つ）
- **メイン特集セクション (H2)**:
  - 今回のトップトピック（${mainTopic.title}）をガッツリ深掘り
  - H3「何が起きた？新発表のポイント」
  - H3「ここが熱い！既存ツールや前モデルとの違い」
  - H3「で、僕たちの生活や作業はどう変わる？（買い替え・導入判断）」
  - 一次情報リンク: [公式サイト・元記事](${mainTopic.link || mainTopic.news?.[0]?.url || ''})
- **あわせて読みたい注目テックニュース4選 (H2)**:
  - サブトピックをそれぞれH3見出しで、1〜2段落＋エディターの一言コメント（「これ試してみたい」「ここがツッコミどころ」など）を添えて軽快に紹介。
- **まとめ部**:
  - <ConclusionBox> コンポーネントを配置（本日の総括・物欲メモ・読者が今すぐ試すべきワンアクション）
- **HTML構文**:
  - <br />、<hr />などは必ず自己閉じタグにすること。
  - 出力はMarkdown本文のみ（Frontmatter含む）。`;

  const userPrompt = `日付: ${dateInfo.formattedJa}（${dateInfo.dateStr}）

${mainTopicData}

【あわせて紹介するサブトピック】
${subTopicsData}

上記の情報を料理して、読者が思わず引き込まれるギズモード・ジェットストリーム風の最高に面白いテックブログ記事を執筆してください！`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: systemInstruction + '\n\n---\n\n' + userPrompt }]
      }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API呼び出しエラー (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  let generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!generatedText) {
    throw new Error('Gemini APIからテキストが取得できませんでした。');
  }

  generatedText = generatedText.replace(/^```(?:mdx|markdown)?\s*\n/, '').replace(/\n```\s*$/, '').trim();
  return generatedText;
}

// ギズモード・ジェットストリーム風フォールバック記事生成（APIキー未設定時）
function generateFallbackArticle(mainTopic, subTopics, dateInfo) {
  const mainCleanTitle = mainTopic.title.replace(/[-|].*$/, '').trim();
  const title = `【${dateInfo.mm}月${dateInfo.dd}日】${mainCleanTitle.slice(0, 24)}がアツい！今すぐチェックしたい最新AI＆ガジェットまとめ`;
  const description = `${dateInfo.formattedJa}の注目テックトレンドを徹底チェック！大きな話題を呼んでいる「${mainCleanTitle.slice(0, 20)}」の魅力や活用ポイントから、注目の最新ガジェット・AI動向まで、ギーク目線で熱量たっぷりにお届けします。`;

  let mdx = `---
title: "${title}"
description: "${description}"
pubDate: "${dateInfo.dateStr}"
categories: ["AIトレンド", "ガジェット", "IT・テック"]
heroImage: "./hero.jpg"
---
import ProblemBox from '../../../components/ProblemBox.astro';
import ConclusionBox from '../../../components/ConclusionBox.astro';

テクノロジーとガジェットの進化スピード、本当に速すぎて毎日ワクワクが止まりませんね。

本日も開発者コミュニティやSNSで**「これは試してみたい！」「生活や作業環境が変わりそう！」**と話題沸騰中の最新AIツール＆ガジェットトレンドを厳選してピックアップしました。

<ProblemBox>
- 「${mainCleanTitle.slice(0, 25)}」が話題だけど、何がそんなに凄いの？
- 最新のAIツールやガジェットを使って日々の作業を爆速化したい
- 忙しい合間に、今日の面白いテック界隈のニュースをサクッとインプットしたい
</ProblemBox>

まずは今日一番の注目トピックからじっくり見ていきましょう！

---

## 🔥 【本日のメイン特集】${mainTopic.title}

本日、テック界隈やはてなブックマークで特に大きな反響を呼んでいるのがこちらの話題です。

${mainTopic.description ? `> ${mainTopic.description}\n\n` : ''}

### なぜ今、こんなに話題になっているのか？
単なる新機能の追加やスペックアップにとどまらず、**「ユーザーが日々感じていたあの不便やハードルをどう解消してくれるか」**という実践的な切り口が刺さっているのがポイントです。

- **作業の手間を劇的に削減**: 面倒だった定型フローや管理作業をスマートに肩代わり
- **既存ツールとの圧倒的な差**: これまでの類似サービスで「あと一歩足りなかったところ」に手が届く仕様
- **ギーク心をくすぐるロマン**: 新しいテクノロジーの可能性を肌で感じられる体験

### で、僕たちの生活や仕事はどう変わる？
実際に導入・活用が進むことで、日々のPC作業やデジタルワークの生産性が一段階引き上げられる予感がします。

もちろん、「ここはどうなの？」という懸念点や今後の機能改善に期待したい部分もありますが、まずは一度試してみる価値が大いにある注目のトピックと言えますね。

👉 **一次情報・元記事をチェック**:  
<a href="${mainTopic.link || mainTopic.news?.[0]?.url || '#'}" target="_blank" rel="noopener noreferrer">${mainTopic.title}</a>

---

## ⚡️ あわせてチェックしたい！今日の注目テックニュース4選

メイン特集以外にも、今日は見逃せない面白いニュースやツールが揃っています。サクッとチェックしていきましょう！

`;

  subTopics.slice(0, 4).forEach((t, i) => {
    const url = t.link || t.news?.[0]?.url || '#';
    mdx += `### ${i + 1}. ${t.title}\n\n`;
    if (t.description) {
      mdx += `${t.description}\n\n`;
    }
    mdx += `**エディターの一言メモ**:<br />\n`;
    mdx += `テクノロジーの進化が日常のちょっとした不満を解決していく様子は、見ているだけでも本当に面白いですね。今後のアップデートや実機レビューの登場も楽しみなところです！\n\n`;
    mdx += `🔗 <a href="${url}" target="_blank" rel="noopener noreferrer">詳細や元リンクはこちら</a>\n\n---\n\n`;
  });

  mdx += `<ConclusionBox>
- 本日は「${mainCleanTitle.slice(0, 20)}」を中心に、AIの現場活用やユニークなテック動向をお届けしました。
- 気になったツールやサービスがあれば、まずは無料枠や手元の環境でサクッと触ってみるのが一番の近道です。
- 次回もワクワクするようなガジェット＆テックニュースをお届けします！
</ConclusionBox>\n`;

  return mdx;
}

// サムネイル画像（hero.jpg）の取得・保存
async function prepareHeroImage(targetDir, imageUrl) {
  const heroPath = path.join(targetDir, 'hero.jpg');

  if (imageUrl) {
    try {
      console.log(`🖼️ テック関連サムネイル画像をダウンロード中: ${imageUrl}`);
      const res = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > 500) {
          fs.writeFileSync(heroPath, Buffer.from(buffer));
          console.log(`✅ hero.jpg を保存しました (${buffer.byteLength} bytes)`);
          return;
        }
      }
    } catch (e) {
      console.warn('⚠️ サムネイル画像の取得に失敗しました。フォールバック画像を適用します。', e.message);
    }
  }

  // フォールバックJPEG
  console.log('🖼️ フォールバック hero.jpg を作成中...');
  const minimalJpgBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  fs.writeFileSync(heroPath, Buffer.from(minimalJpgBase64, 'base64'));
  console.log('✅ フォールバック hero.jpg を保存しました');
}

// 安全なGitコミット＆プッシュ（安全照合付き）
function performAutoPush(slug) {
  console.log('\n🔒 === 安全なGitコミット＆プッシュを開始 ===');
  
  // 1. リモートURLの照合
  try {
    const remoteOutput = execSync('git remote -v', { cwd: NEWS_ROOT, encoding: 'utf-8' });
    const isTargetNewsRepo = remoteOutput.includes('teluis5/teluis-news');
    if (!isTargetNewsRepo) {
      throw new Error(`リモートURLが teluis-news と一致しません！誤爆防止のためプッシュを中断します:\n${remoteOutput}`);
    }
    console.log('✅ リモートURL照合OK: teluis-news リポジトリを確認しました。');
  } catch (err) {
    console.error('❌ リモートURL照合エラー:', err.message);
    return false;
  }

  // 2. ステージング & コミット & プッシュ
  try {
    const targetBlogRelPath = `src/content/blog/${slug}`;
    console.log(`📦 ステージング中: ${targetBlogRelPath}`);
    execSync(`git add "${targetBlogRelPath}"`, { cwd: NEWS_ROOT, stdio: 'inherit' });

    // ステータス確認
    const status = execSync('git status --porcelain', { cwd: NEWS_ROOT, encoding: 'utf-8' });
    if (!status.includes(slug)) {
      console.log('ℹ️ コミットする新しい差分がありません。');
      return true;
    }

    const commitMsg = `feat(news): add daily tech trend ${slug}`;
    console.log(`💬 コミット実行: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg}"`, { cwd: NEWS_ROOT, stdio: 'inherit' });

    console.log('🚀 リモート (origin main) へプッシュ中...');
    execSync('git push origin main', { cwd: NEWS_ROOT, stdio: 'inherit' });

    console.log('🎉 Gitプッシュが完了しました！GitHub Pagesの自動デプロイが開始されます。');
    return true;
  } catch (err) {
    console.error('❌ Gitプッシュ処理中にエラーが発生しました:', err.message);
    return false;
  }
}

// メイン処理
async function main() {
  console.log('🚀 === teluis news 【ギズモード×ジェットストリーム風】テックトレンド自動生成 ===');
  const dateInfo = getJSTDate();
  console.log(`📅 対象日付: ${dateInfo.dateStr} (${dateInfo.formattedJa})`);
  console.log(`🔑 Gemini APIキー状態: ${GEMINI_API_KEY ? '設定済み ✅' : '未設定（フォールバックモード） ⚠️'}`);

  // 1. はてブ（テクノロジー）の取得
  const hatenaTechTopics = await fetchHatenaTechTrends();
  console.log(`📊 取得したはてブ（テック）候補: ${hatenaTechTopics.length}件`);

  // 2. Google Trends の取得（厳格なテック・ガジェット・AIのみ）
  const googleTechTopics = await fetchGoogleTrendsTech();
  console.log(`📊 取得したGoogle急上昇（テック）候補: ${googleTechTopics.length}件`);

  // 統合・トピック選定
  const combinedTopics = [];
  googleTechTopics.forEach(t => combinedTopics.push(t));
  for (const t of hatenaTechTopics) {
    if (combinedTopics.length >= 8) break;
    if (!combinedTopics.some(c => c.title === t.title)) {
      combinedTopics.push(t);
    }
  }

  if (combinedTopics.length === 0) {
    console.error('❌ IT・ガジェット・AI関連のトレンド情報を取得できませんでした。');
    process.exit(1);
  }

  const mainTopic = combinedTopics[0];
  const subTopics = combinedTopics.slice(1);

  console.log(`🔥 【本日のメイン特集】: ${mainTopic.title}`);
  console.log(`📌 【サブトピック】: ${subTopics.length}件`);

  // 記事保存先ディレクトリ（Googleドライブ内に直接作成！）
  const slug = `${dateInfo.dateStr}-tech-trend-digest`;
  const targetDir = path.join(NEWS_ROOT, 'src', 'content', 'blog', slug);

  if (fs.existsSync(targetDir) && !isForce) {
    console.log(`ℹ️ すでに本日の記事ディレクトリが存在します: ${slug}`);
    console.log('   上書きする場合は --force を指定してください。');
    if (isAutoPush) {
      console.log('   --auto-push が指定されているため、Gitプッシュのみ試行します。');
      performAutoPush(slug);
    }
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  // サムネイル画像
  const imageUrl = mainTopic.image || mainTopic.picture || subTopics.find(t => t.image || t.picture)?.image;
  await prepareHeroImage(targetDir, imageUrl);

  // 記事本文の生成
  let articleMdx = '';
  if (isDryRun) {
    console.log('🧪 --dry-run モード: ギズモード風テンプレート記事を生成します。');
    articleMdx = generateFallbackArticle(mainTopic, subTopics, dateInfo);
  } else {
    articleMdx = await generateArticleWithGemini(mainTopic, subTopics, dateInfo);
  }

  // ファイル書き出し（Googleドライブへの実体保存）
  const mdxPath = path.join(targetDir, 'index.mdx');
  fs.writeFileSync(mdxPath, articleMdx, 'utf-8');
  console.log(`💾 Googleドライブへ記事を保存しました: ${mdxPath}`);

  // 自動Gitプッシュ
  if (isAutoPush) {
    performAutoPush(slug);
  } else {
    console.log('💡 コミット＆プッシュまで自動実行する場合は --auto-push を指定してください。');
  }

  console.log('🎉 すべての処理が完了しました！');
}

main().catch(err => {
  console.error('❌ エラーが発生しました:', err);
  process.exit(1);
});
