import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const getDailyMenu = async (req: Request, res: Response) => {
  try {
    const { userId, dailyDinerOverride, humidity } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId as string }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const availableDishes = await prisma.dish.findMany({
      include: {
        ingredients: true
      }
    });

    const payload = {
      current_user: {
        name: user.name,
        baseline_diners: user.dinerCount,
        health_tags: user.healthTags,
        taste_prefs: user.tastePrefs,
        helper_language: "Tagalog"
      },
      context: {
        daily_diner_override: dailyDinerOverride ? parseInt(dailyDinerOverride as string) : user.dinerCount,
        current_humidity: humidity || "85%",
        available_dishes_in_db: availableDishes
      }
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-pro-latest",
      generationConfig: { responseMimeType: "application/json" },
      systemInstruction: `You are the core Culinary Curation & Symphony Cooking Engine for "Nutri-Pilot" (悦小厨). Your task is to process the user payload and output a perfectly formatted JSON containing:
1. "gold_menu" based on target diners and health tags.
2. "sourcing_groups" split into Premium Partners and Nearby Merchants. Scaled weights based on target diners/3 ratio.
3. "helper_instructions" containing prep_phase with tray_slot and cook_phase with stove_a/b timers translated to Tagalog.
Do not wrap your output in markdown code blocks. Always output pure raw JSON.`
    });

    const result = await model.generateContent(JSON.stringify(payload));
    const responseText = result.response.text();

    const finalResult = JSON.parse(responseText);
    return res.json(finalResult);

  } catch (error) {
    console.error('Core algorithm generation error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
