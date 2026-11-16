/** 设置页: 全局参数 + 鱼眼映射精度自检 + 存储管理 */
import { cpuRoundTripError, runGpuSelfTest, SelfTestResult } from '../../render/selftest';
import { degreesPerPixel } from '../../core/fisheye';
import { button, el, field, numberInput, section } from '../widgets';
import { AppContext } from '../router';

export function mountSettings(root: HTMLElement, ctx: AppContext): void {
  const s = ctx.settings;

  const testResults = el('div', { class: 'selftest-results' });

  root.append(
    el('div', { class: 'page-header' }, el('h2', { text: '设置' })),
    el('div', { class: 'export-layout' },
      section('渲染',
        field('默认星等上限', numberInput(s.magLimit, {
          min: 0, max: 6.5, step: 0.5,
          onchange: (v) => { s.magLimit = v; ctx.saveSettings(); },
        })),
        field('恒星曝光', numberInput(s.starExposure, {
          min: 0.1, max: 4, step: 0.1,
          onchange: (v) => { s.starExposure = v; ctx.saveSettings(); },
        })),
        field('立方体贴图尺寸', numberInput(s.cubeSize, {
          min: 256, max: 4096, step: 256,
          onchange: (v) => { s.cubeSize = Math.round(v); ctx.saveSettings(); },
        })),
        el('p', { class: 'muted', text: '立方体贴图越大, 预览越细腻; 修改后刷新生效。' }),
      ),
      section('鱼眼映射精度自检',
        el('p', { class: 'muted', text:
          '用 GPU 实际渲染一张方向编码图, 逐像素读回并与 CPU 参考公式核对。' +
          '要求: 球面上任意方向在 domemaster 中的像素位置误差 < 0.5 像素。' }),
        button('运行自检', () => runSelfTest(), 'primary'),
        testResults,
      ),
      section('存储',
        el('p', { class: 'muted', text: `节目与设置保存在浏览器 localStorage。当前节目数: ${ctx.store.shows.length}` }),
        button('清空全部数据', () => {
          if (confirm('确定删除所有节目与设置? 此操作不可恢复。')) {
            ctx.store.clearAll();
            localStorage.removeItem('domepreview.settings.v1');
            location.reload();
          }
        }, 'danger'),
      ),
    ),
  );

  function runSelfTest() {
    testResults.innerHTML = '';
    testResults.append(el('p', { class: 'muted', text: '自检运行中…' }));

    // 延迟到下一帧, 让"运行中"先渲染出来
    setTimeout(() => {
      const cases = [
        { size: 1024, fovDeg: 180, tiltDeg: 0 },
        { size: 1024, fovDeg: 180, tiltDeg: 15 },
        { size: 1024, fovDeg: 180, tiltDeg: 30 },
        { size: 1024, fovDeg: 210, tiltDeg: 0 },
        { size: 1024, fovDeg: 210, tiltDeg: 15 },
        { size: 1024, fovDeg: 210, tiltDeg: 30 },
      ];

      const results: SelfTestResult[] = [];
      let cpuErr = 0;
      try {
        for (const c of cases) results.push(runGpuSelfTest(c, ctx.settings.selfTestStep));
        cpuErr = cpuRoundTripError({ size: 4096, fovDeg: 210, tiltDeg: 30 });
      } catch (e) {
        testResults.innerHTML = '';
        testResults.append(el('p', { class: 'error', text: `自检失败: ${e instanceof Error ? e.message : e}` }));
        return;
      }

      testResults.innerHTML = '';
      const allPass = results.every((r) => r.pass);
      testResults.append(
        el('p', { class: allPass ? 'pass' : 'error', text:
          allPass ? '✓ 全部通过: GPU 映射与公式误差 < 0.5 像素' : '✗ 存在超差项, 请检查' }),
        el('table', { class: 'show-table' },
          el('thead', {}, el('tr', {},
            el('th', { text: '视场' }), el('th', { text: '倾角' }), el('th', { text: '采样数' }),
            el('th', { text: '最大误差(px)' }), el('th', { text: '平均误差(px)' }),
            el('th', { text: '1px 对应角度' }), el('th', { text: '结论' }))),
          el('tbody', {}, ...results.map((r) => el('tr', {},
            el('td', { text: `${r.params.fovDeg}°` }),
            el('td', { text: `${r.params.tiltDeg}°` }),
            el('td', { text: String(r.samples) }),
            el('td', { text: r.maxErrPx.toFixed(4) }),
            el('td', { text: r.meanErrPx.toFixed(4) }),
            el('td', { text: `${degreesPerPixel(r.params).toFixed(4)}°` }),
            el('td', { class: r.pass ? 'pass' : 'error', text: r.pass ? '通过' : '超差' }),
          ))),
        ),
        el('p', { class: 'muted', text:
          `CPU 公式自闭环(方向→像素→方向)最大角度误差: ${(cpuErr * 180 / Math.PI).toExponential(2)}° ` +
          '(4096px / 210° 下 1px ≈ 0.051°)' }),
      );
    }, 50);
  }
}
