import Decimal from 'decimal.js'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export function formatCents(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits,
  }).format(value / 100)
}

export function yuanToCents(value: number): number {
  return new Decimal(value).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function multiplyToCents(quantity: number, unitPriceCents: number): number {
  return new Decimal(quantity).times(unitPriceCents).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

export function centsToChineseUppercase(value: number): string {
  const negative = new Decimal(value).isNegative()
  const cents = new Decimal(value).abs().toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  const integer = cents.dividedToIntegerBy(100).toFixed(0)
  const fraction = cents.mod(100).toNumber()
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const smallUnits = ['', '拾', '佰', '仟']
  const sectionUnits = ['', '万', '亿', '兆', '京']
  const sections: string[] = []
  for (let end = integer.length; end > 0; end -= 4) sections.unshift(integer.slice(Math.max(0, end - 4), end))
  let result = ''
  let pendingZero = false
  sections.forEach((section, sectionIndex) => {
    const padded = section.padStart(4, '0')
    let text = ''
    for (let index = 0; index < 4; index += 1) {
      const digit = Number(padded[index])
      if (digit === 0) { if (text) pendingZero = true; continue }
      if ((pendingZero || (result && index > 0)) && !text.endsWith('零') && !result.endsWith('零')) text += '零'
      text += digits[digit] + smallUnits[3 - index]
      pendingZero = false
    }
    if (text) result += text + sectionUnits[sections.length - sectionIndex - 1]
  })
  if (!result) result = '零'
  const jiao = Math.floor(fraction / 10)
  const fen = fraction % 10
  const fractionText = jiao ? `${digits[jiao]}角${fen ? `${digits[fen]}分` : ''}` : fen ? `零${digits[fen]}分` : '整'
  return `${negative ? '负' : ''}人民币${result}元${fractionText}`
}
