// 太阳直射点。近似公式加时差修正，误差在 1° 以内，画晨昏线足够。单独放一个文件，时钟用它时不用等 three 下载
export function subsolarPoint(date = new Date()) {
  const day = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const b = ((2 * Math.PI) / 364) * (day - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + eot / 60;
  return { lat: decl, lon: -15 * (hours - 12) };
}
