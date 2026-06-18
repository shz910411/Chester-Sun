import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { stripToFoodFacts } from '../common/compliance';

/**
 * AI 餐食解析 —— 本项目技术心脏。
 * 主：阿里云百炼 qwen-vl-plus（OpenAI 兼容模式）。失败兜底：返回 failed，前端转手填。
 * 输出经 compliance 过滤：只出食物事实，绝不出医疗/减肥建议。
 */
@Injectable()
export class FoodVisionService {
  private log = new Logger('FoodVision');
  constructor(private cfg: ConfigService) {}

  private prompt =
    '你是营养记录助手。识别餐食照片里的食物，严格输出 JSON：' +
    '{"items":[{"name":"食物名","portion":"份量描述","kcal_est":数字,"confidence":"high/medium/low"}]}。' +
    '只描述食物事实（名称/份量/估算能量）。严禁任何减肥建议、医疗评价、"少吃/超标/不健康/多运动"等措辞。';

  async analyze(imageUrl: string): Promise<{ items: any[]; ai_status: 'done' | 'failed'; raw?: any }> {
    const key = this.cfg.get('DASHSCOPE_API_KEY');
    const model = this.cfg.get('FOOD_VISION_PRIMARY', 'qwen-vl-plus');
    if (!key) {
      this.log.warn('未配置 DASHSCOPE_API_KEY，跳过 AI');
      return { items: [], ai_status: 'failed' };
    }
    try {
      const { data } = await axios.post(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: this.prompt },
                { type: 'image_url', image_url: { url: imageUrl } },
              ],
            },
          ],
        },
        { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 },
      );
      const text: string = data?.choices?.[0]?.message?.content || '{}';
      const json = JSON.parse(text.replace(/```json|```/g, '').trim());
      return { items: stripToFoodFacts(json.items || []), ai_status: 'done', raw: json };
    } catch (e: any) {
      this.log.warn(`AI 解析失败，转手填兜底: ${e?.message}`);
      return { items: [], ai_status: 'failed' };
    }
  }

  /** 配料表 OCR：读营养成分表，抽取能量（国标多为 kJ/100g） */
  async analyzeLabel(imageUrl: string): Promise<{ energy_kj_per_100g: number | null; protein_g_per_100g: number | null; basis: string }> {
    const key = this.cfg.get('DASHSCOPE_API_KEY');
    const model = this.cfg.get('FOOD_VISION_PRIMARY', 'qwen-vl-plus');
    if (!key) return { energy_kj_per_100g: null, protein_g_per_100g: null, basis: '' };
    try {
      const prompt =
        '读取这张包装食品的营养成分表，只输出 JSON：' +
        '{"energy_kj_per_100g":数字,"protein_g_per_100g":数字,"basis":"每100g或每份"}。' +
        '能量取"能量"行的 kJ 值。读不到的字段填 null。';
      const { data } = await axios.post(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          }],
        },
        { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 },
      );
      const text: string = data?.choices?.[0]?.message?.content || '{}';
      const json = JSON.parse(text.replace(/```json|```/g, '').trim());
      return {
        energy_kj_per_100g: json.energy_kj_per_100g ?? null,
        protein_g_per_100g: json.protein_g_per_100g ?? null,
        basis: json.basis || '每100g',
      };
    } catch {
      return { energy_kj_per_100g: null, protein_g_per_100g: null, basis: '' };
    }
  }
}
