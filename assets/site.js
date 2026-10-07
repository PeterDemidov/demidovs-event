(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  // Content stays visible if scripts or IntersectionObserver are unavailable.
  if ('IntersectionObserver' in window && !reducedMotion()) {
    try {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, {threshold: 0.12});
      $$('.reveal').forEach((element) => observer.observe(element));
      document.documentElement.classList.add('motion-ready');
    } catch {
      document.documentElement.classList.remove('motion-ready');
    }
  }

  const progress = $('#progress');
  if (progress) {
    let busy = false;
    window.addEventListener('scroll', () => {
      if (busy) return;
      busy = true;
      window.requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const fraction = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
        progress.style.transform = `scaleX(${fraction})`;
        busy = false;
      });
    }, {passive: true});
  }

  const setupCarousel = (trackId, previousId, nextId, cardSelector) => {
    const track = $(trackId);
    if (!track) return;
    const move = (direction) => {
      const card = track.querySelector(cardSelector);
      const gap = parseFloat(window.getComputedStyle(track).columnGap) || 16;
      const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth;
      track.scrollBy({left: direction * step, behavior: reducedMotion() ? 'auto' : 'smooth'});
    };
    $(previousId)?.addEventListener('click', () => move(-1));
    $(nextId)?.addEventListener('click', () => move(1));
    track.addEventListener('keydown', (event) => {
      // Keep keyboard events inside review links/details untouched.
      if (event.target !== track) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  };
  setupCarousel('#galleryTrack', '#galleryPrev', '#galleryNext', '.gallery-card');
  setupCarousel('#reviewsTrack', '#reviewsPrev', '#reviewsNext', '.review');

  $$('video').forEach((video) => {
    const fallback = video.nextElementSibling;
    const showFallback = () => {
      if (fallback?.classList.contains('video-fallback')) fallback.hidden = false;
    };
    video.addEventListener('error', showFallback);
    video.querySelectorAll('source').forEach((source) => source.addEventListener('error', showFallback));
  });

  const form = $('#leadForm');
  if (!form) return;
  const phone = form.elements.namedItem('phone');
  const note = $('#formNote');
  const validatePhone = () => {
    const value = phone.value.trim();
    const count = value.replace(/\D/g, '').length;
    phone.setCustomValidity(value && (!/^[+\d\s().-]+$/.test(value) || count < 7 || count > 15)
      ? 'Укажите номер телефона: от 7 до 15 цифр.' : '');
  };
  phone.addEventListener('input', validatePhone);
  const contacts = {
    petr: {name: 'Пётр', phone: '79260676601', telegram: 'p_demidov'},
    natalia: {name: 'Наталья', phone: '79055239530', telegram: 'demi_nata'}
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    validatePhone();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const contact = contacts[data.get('recipient')];
    if (!contact) {
      if (note) note.textContent = 'Выберите, с кем хотите связаться.';
      return;
    }
    const channel = data.get('channel');
    if (channel === 'call') {
      window.location.href = `tel:+${contact.phone}`;
      return;
    }
    const message = [
      `Здравствуйте, ${contact.name}! Хочу проверить дату мероприятия.`,
      '',
      `Имя: ${data.get('name')}`,
      `Телефон: ${data.get('phone')}`,
      `Дата: ${data.get('date') || 'пока не определена'}`,
      `Формат: ${data.get('format')}`,
      `Гостей: ${data.get('guests') || 'уточню позже'}`,
      `Город или площадка: ${data.get('city') || 'уточню позже'}`,
      `Связаться: ${channel}`
    ].join('\n');
    const encoded = encodeURIComponent(message);
    const url = channel === 'telegram'
      ? `https://t.me/${contact.telegram}?text=${encoded}`
      : `https://wa.me/${contact.phone}?text=${encoded}`;
    // Same-tab navigation avoids popup blockers, particularly on mobile.
    window.location.href = url;
  });
  // Do not expose a form that could submit personal data without its handler.
  form.classList.add('ready');
})();
