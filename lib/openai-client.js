const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// ======================================================================
// OpenAI (AI家庭教師) 連携関数
// ======================================================================
async function getAiResponse(userData, messageText, messageType = 'text', imageUrl = null) {
    const userGrade = userData.grade || '中学生・高校生';
    const userWeakSubject = userData.weak_subject || '特に無し';

    let prompt = `あなたは「AI家庭教師くん」という名前の親しみやすい塾講師です。
    生徒の${userGrade}に向けた言葉遣いをし、小さなことにも気づいて褒め、前向きな気持ちになるようにサポートしてください。
    特に、生徒が質問から学習指導要領のどこでつまずいているかを推測し、具体的に分かりやすく教えてください。
    現在の生徒の苦手科目は${userWeakSubject}です。この情報も考慮してください。`;

    const messages = [
        { role: "system", content: prompt },
    ];

    if (messageType === 'image' && imageUrl) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: messageText || "画像に関する質問です。" },
                { type: "image_url", image_url: { url: imageUrl } }
            ]
        });
    } else {
        messages.push({ role: "user", content: messageText });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            max_tokens: 500,
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI API エラー:", error.response ? error.response.data : error.message);
        return "ごめんなさい、今はうまく考えられないようです。もう一度質問してください。";
    }
}
module.exports = { getAiResponse };