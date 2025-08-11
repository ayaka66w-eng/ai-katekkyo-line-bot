const axios = require('axios');
const GAS_WEB_APP_URL = process.env.GAS_WEB_APP_URL;
// ======================================================================
// Google Apps Script (GAS) 連携関数
// ======================================================================
async function updateSpreadsheet(userId, data) {
    try {
        // ↓ デバッグ用のログ
        console.log(`これからGASを呼び出します。Action: updateUser, UserID: ${userId}`);
        
        await axios.post(GAS_WEB_APP_URL, {
            action: 'updateUser',
            userId: userId,
            data: data
        });
        console.log('スプレッドシート更新成功:', userId, data);
        return true;
    } catch (error) {
        // ↓ エラーの詳細を表示するためのログ
        console.error('スプレッドシート更新エラーの詳細:', error.response ? error.response.data : error.message);
        return false;
    }
}

async function getSpreadsheetData(userId) {
    try {
        const response = await axios.get(GAS_WEB_APP_URL, {
            params: { action: 'getUser', userId: userId }
        });
        return response.data;
    } catch (error) {
        console.error('スプレッドシート取得エラー:', error.response ? error.response.data : error.message);
        return null;
    }
}

async function getFaqAnswer(question) {
    try {
        const response = await axios.get(GAS_WEB_APP_URL, {
            params: { action: 'getFaq', question: question }
        });
        return response.data.answer;
    } catch (error) {
        console.error('FAQ取得エラー:', error.response ? error.response.data : error.message);
        return null;
    }
}
const REPLY_MESSAGES = {
    welcome: "AI家庭教師くんへようこそ！あなたの学びを全力でサポートします。\nまずはいくつかの質問に答えて、あなただけの家庭教師をカスタマイズしましょう！",
    askGrade: "まずはあなたの学年を教えてください！\n\n「小学生」「中学生」「高校生」「大学生」「社会人」の中から選んで返信してくださいね。",
    askGender: "性別を教えてください。\n\n「男性」「女性」「その他」の中から選んで返信してください。",
    askRegion: "お住まいの地域を教えてください。\n例: 東京都、大阪府、北海道",
    askWeakSubject: "苦手な科目はありますか？複数回答もOKです。\n例: 数学、英語、国語、理科、社会",
    askHowKnown: "AI家庭教師くんをどこで知りましたか？\n例: HP、Instagram、X、TikTok、検索、チラシ、紹介",
    askTermsOfService: "ヒアリングにご協力ありがとうございます！\nAI家庭教師くんの利用には、利用規約への同意が必要です。\n以下のURLから内容をご確認ください。\n[利用規約URLをここに貼る]\n\n内容に同意いただけたら「同意する」と返信してください。",
    termsAccepted: "ありがとうございます！利用規約に同意いただきました。\n無料期間がスタートしました！\n本日より5日間、AI家庭教師くんを無料でご利用いただけます。",
    rehearingComplete: "再設定が完了しました！ありがとう。",
    trialEndMessage: "無料期間が終了しました。\n引き続きご利用いただくには、有料プランへのアップグレードが必要です。\n「500円」とメッセージを送信して、アップグレード手続きに進んでください。",
    upgradePrompt: "無制限プランへのアップグレードはこちらからどうぞ！\n[決済ページURLをここに貼る]",
    error: "ごめんなさい、エラーが発生しました。もう一度お試しください。",
    invalidInput: "すみません、入力内容が理解できませんでした。正しい形式で入力してくださいね。",
    upgradeInstructions: "無制限プランへのお申し込みは、[決済ページURLをここに貼る] からお願いします。",
    alreadyAgreed: "すでに利用規約には同意済みです。ご利用ありがとうございます！",
    askExamDate: "試験日を教えてください。例：2025年8月3日"
};
module.exports = { updateSpreadsheet, getSpreadsheetData, getFaqAnswer, REPLY_MESSAGES };