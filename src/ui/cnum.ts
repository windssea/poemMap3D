const CN = '〇一二三四五六七八九十'

/** 汉字数字（一、十二、二十三……） */
export const cnum = (n: number): string => (n <= 10 ? CN[n] : n < 20 ? '十' + CN[n - 10] : CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : ''))
