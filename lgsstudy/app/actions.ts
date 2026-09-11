"use server";

import { sql } from "@vercel/postgres";
import { GoogleGenAI } from "@google/genai";
import { revalidatePath } from "next/cache";

// 初始化 Gemini AI 變數
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// 1. 提交靈修打卡與生成 AI 亮光摘要
export async function submitCheckin(formData: FormData) {
  const userName = (formData.get("userName") as string) || "";
  const checkinDate = (formData.get("checkinDate") as string) || "";
  const reflection = (formData.get("reflection") as string) || "";

  if (!userName || !checkinDate || !reflection) {
    return;
  }

  let aiSummary = "";
  try {
    const prompt = `你是一位靈修導師，請針對以下弟兄姊妹的靈修心得，提供 1-2 句溫暖、具鼓勵性的「亮光摘要與回應」：\n\n心得內容：${reflection}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    aiSummary = response.text || "";
  } catch (err) {
    console.error("AI 摘要生成失敗:", err);
    aiSummary = "願神話語成為你腳前的燈、路上的光。";
  }

  try {
    await sql`
      INSERT INTO checkins (user_name, checkin_date, reflection, ai_summary, is_approved)
      VALUES (${userName}, ${checkinDate}, ${reflection}, ${aiSummary}, FALSE);
    `;
    revalidatePath("/");
  } catch (err) {
    console.error("資料庫寫入失敗:", err);
  }
}

// 2. 取得所有打卡紀錄
export async function getCheckins() {
  try {
    const { rows } = await sql`
      SELECT * FROM checkins ORDER BY created_at DESC;
    `;
    return rows;
  } catch (err) {
    console.error("讀取紀錄失敗:", err);
    return [];
  }
}

// 3. 表達感受 (Like / Dislike / Neutral)
export async function updateReaction(
  id: string | number,
  reaction: "like" | "dislike" | "neutral",
) {
  try {
    await sql`
      UPDATE checkins SET reaction = ${reaction} WHERE id = ${id};
    `;
    revalidatePath("/");
  } catch (err) {
    console.error("更新回應失敗:", err);
  }
}
