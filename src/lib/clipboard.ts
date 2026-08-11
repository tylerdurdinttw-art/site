/**
 * Копирование в буфер обмена.
 *
 * navigator.clipboard существует только в защищённом контексте (https или
 * localhost). Панель часто открыта по http на IP сервера — там API просто нет,
 * и вызов падает с TypeError. Поэтому есть запасной путь через скрытое поле и
 * document.execCommand: он работает в любом браузере, пока вызван внутри
 * обработчика клика.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Разрешение не выдано или контекст всё-таки не тот — уходим в запасной путь.
    }
  }

  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // Поле не должно мелькать и уводить страницу вбок при фокусе.
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.width = '1px';
  area.style.height = '1px';
  area.style.padding = '0';
  area.style.border = 'none';
  area.style.opacity = '0';

  const selection = document.getSelection();
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  document.body.appendChild(area);
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, area.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    // Возвращаем выделение пользователя на место.
    if (previous && selection) {
      selection.removeAllRanges();
      selection.addRange(previous);
    }
  }
}
