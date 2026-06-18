/**
 * 合规过滤层 —— 用户可见层 / AI 输出 / 自动小结 的出口必经。
 * 广告法：不出现「减脂/减肥/瘦/燃脂」等；医疗暗示：不出现「治疗/超标/不健康」等。
 * 口径：线上一律「轻体」。
 */

// 直接删除的硬禁词（极限词 / 医疗暗示）
const STRIP = ['超标', '不健康', '治疗', '治愈', '根治', '排毒', '最有效', '第一名', '彻底解决'];

// 替换词（保留语义、换合规说法）
const REPLACE: [RegExp, string][] = [
  [/减脂|减肥/g, '轻体'],
  [/燃脂/g, '促进代谢'],
  [/瘦身|瘦下来|变瘦/g, '轻体'],
  [/暴瘦|狂瘦/g, '稳步轻体'],
];

export function sanitizeText(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [re, to] of REPLACE) out = out.replace(re, to);
  for (const w of STRIP) out = out.split(w).join('');
  return out.trim();
}

/** AI 餐食输出：只保留食物事实字段，丢弃任何评价/建议；能量统一标估算 */
export function stripToFoodFacts(items: any[]): any[] {
  return (items || []).map((it) => ({
    name: sanitizeText(it.name || it.food_name || ''),
    portion: it.portion || it.portion_text || '',
    kcal_est: it.kcal_est ?? it.kcal ?? null,
    confidence: it.confidence || 'medium',
  }));
}
