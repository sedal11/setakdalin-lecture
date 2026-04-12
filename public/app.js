/**
 * 세탁의달인 강의 뷰어
 * - 비밀번호 잠금
 * - 날짜 기반 잠금 (강의일 다음날 자정 KST부터 차단)
 * - 전/후 사진 비교 + 스와이프 네비게이션
 */

(function () {
  'use strict';

  // --- 상태 ---
  let lectureData = null;
  let currentSlide = 0;
  let currentTab = 'before'; // 'before' | 'after'
  let touchStartX = 0;
  let touchEndX = 0;

  // --- DOM ---
  const $ = (id) => document.getElementById(id);

  // --- 현재 강의 경로 (최신 폴더 자동 감지) ---
  async function findLatestLecture() {
    // lectures/ 폴더 아래 YYYY-MM 폴더 중 최신 것을 찾음
    // 정적 사이트이므로 알려진 경로를 시도
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const paths = [
      `lectures/${year}-${month}/data.json`,
      `lectures/${year}-${String(now.getMonth()).padStart(2, '0')}/data.json`,
    ];

    for (const path of paths) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          const data = await res.json();
          data._basePath = path.replace('data.json', '');
          return data;
        }
      } catch (_) { /* 다음 경로 시도 */ }
    }
    return null;
  }

  // --- 시간 잠금 체크 (KST) ---
  function isExpired(dateStr) {
    // dateStr: "2026-04-12"
    // 강의일 다음날 00:00 KST부터 차단
    const lectureDateParts = dateStr.split('-').map(Number);
    const lectureDate = new Date(
      lectureDateParts[0],
      lectureDateParts[1] - 1,
      lectureDateParts[2]
    );
    // 다음날 00:00 KST = 전날 15:00 UTC
    const expiry = new Date(lectureDate.getTime() + 24 * 60 * 60 * 1000);

    // 현재 KST 시간
    const nowKST = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
    );

    return nowKST >= expiry;
  }

  // --- 비밀번호 체크 ---
  function checkPassword(input, correct) {
    return input === correct;
  }

  // --- 슬라이드 렌더링 ---
  function renderSlide() {
    if (!lectureData || !lectureData.slides || lectureData.slides.length === 0) return;

    const slide = lectureData.slides[currentSlide];
    const basePath = lectureData._basePath || '';
    const imgKey = currentTab === 'before' ? 'before' : 'after';
    const imgSrc = slide[imgKey];

    const img = $('slide-image');
    const noImg = $('no-image');

    if (imgSrc) {
      img.classList.add('loading');
      img.src = basePath + imgSrc;
      img.onload = () => img.classList.remove('loading');
      img.onerror = () => {
        img.classList.add('hidden');
        noImg.classList.remove('hidden');
      };
      img.classList.remove('hidden');
      noImg.classList.add('hidden');
    } else {
      img.classList.add('hidden');
      noImg.classList.remove('hidden');
    }

    $('slide-label').textContent = slide.label || '';
    $('slide-counter').textContent =
      `${currentSlide + 1} / ${lectureData.slides.length}`;

    renderIndicators();
    updateTabs();
  }

  function renderIndicators() {
    const container = $('indicators');
    container.innerHTML = '';

    lectureData.slides.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = `indicator${i === currentSlide ? ' active' : ''}`;
      dot.addEventListener('click', () => {
        currentSlide = i;
        renderSlide();
      });
      container.appendChild(dot);
    });
  }

  function updateTabs() {
    const before = $('tab-before');
    const after = $('tab-after');

    if (currentTab === 'before') {
      before.className = before.className.replace('tab-inactive', 'tab-active');
      after.className = after.className.replace('tab-active', 'tab-inactive');
    } else {
      after.className = after.className.replace('tab-inactive', 'tab-active');
      before.className = before.className.replace('tab-active', 'tab-inactive');
    }
  }

  // --- 네비게이션 ---
  function goNext() {
    if (currentSlide < lectureData.slides.length - 1) {
      currentSlide++;
      renderSlide();
    }
  }

  function goPrev() {
    if (currentSlide > 0) {
      currentSlide--;
      renderSlide();
    }
  }

  // --- 스와이프 ---
  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  }

  // --- 키보드 ---
  function handleKeydown(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    }
  }

  // --- 초기화 ---
  async function init() {
    lectureData = await findLatestLecture();

    if (!lectureData) {
      $('login-screen').innerHTML = `
        <div class="text-center px-6">
          <div class="text-5xl mb-4">📭</div>
          <h1 class="text-xl font-bold mb-2">강의가 아직 준비되지 않았습니다</h1>
          <p class="text-gray-400 text-sm">곧 새로운 강의가 올라옵니다</p>
        </div>
      `;
      return;
    }

    // 시간 잠금 체크
    if (isExpired(lectureData.date)) {
      $('expired-screen').classList.remove('hidden');
      $('login-screen').classList.add('hidden');
      return;
    }

    // 로그인 화면 제목
    $('login-title').textContent = lectureData.title || '';

    // 세션 체크 (이미 인증됨?)
    const stored = sessionStorage.getItem('lecture_auth');
    if (stored === lectureData.password) {
      showViewer();
      return;
    }

    // 비밀번호 폼
    $('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('password-input').value;

      if (checkPassword(input, lectureData.password)) {
        sessionStorage.setItem('lecture_auth', input);
        showViewer();
      } else {
        $('login-error').classList.remove('hidden');
        $('password-input').value = '';
        $('password-input').focus();
      }
    });
  }

  function showViewer() {
    $('login-screen').classList.add('hidden');
    $('viewer').classList.remove('hidden');

    // 헤더 설정
    $('lecture-title').textContent = lectureData.title || '세탁의달인 강의';
    const dateParts = lectureData.date.split('-');
    $('lecture-date').textContent =
      `${dateParts[0]}년 ${parseInt(dateParts[1])}월 강의`;

    // 탭 이벤트
    $('tab-before').addEventListener('click', () => {
      currentTab = 'before';
      renderSlide();
    });
    $('tab-after').addEventListener('click', () => {
      currentTab = 'after';
      renderSlide();
    });

    // 네비게이션 이벤트
    $('btn-prev').addEventListener('click', goPrev);
    $('btn-next').addEventListener('click', goNext);

    // 스와이프 이벤트
    const container = $('image-container');
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    // 키보드
    document.addEventListener('keydown', handleKeydown);

    // 첫 슬라이드
    renderSlide();
  }

  // --- 시작 ---
  document.addEventListener('DOMContentLoaded', init);
})();
