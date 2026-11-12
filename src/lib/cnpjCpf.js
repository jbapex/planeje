export function digitsCnpjCpf(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}

export function formatCnpjCpf(value) {
  const digits = digitsCnpjCpf(value);
  if (!digits) return '';
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function hasCpfCheckDigits(digits) {
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  const nums = digits.split('').map(Number);
  const calc = (len) => {
    const sum = nums.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === nums[9] && calc(10) === nums[10];
}

function hasCnpjCheckDigits(digits) {
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const nums = digits.split('').map(Number);
  const calc = (len) => {
    let factor = len === 12 ? 5 : 6;
    const sum = nums.slice(0, len).reduce((acc, n) => {
      const current = acc + n * factor;
      factor = factor === 2 ? 9 : factor - 1;
      return current;
    }, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === nums[12] && calc(13) === nums[13];
}

export function isValidCnpjCpf(value) {
  const digits = digitsCnpjCpf(value);
  if (!digits) return true;
  if (digits.length === 11) return hasCpfCheckDigits(digits);
  if (digits.length === 14) return hasCnpjCheckDigits(digits);
  return false;
}
