/** 节目列表页: 增删改复制, 工程导入导出 */
import { downloadBlob } from '../../render/exporter';
import { button, el, formatDateTime } from '../widgets';
import { AppContext } from '../router';

export function mountShows(root: HTMLElement, ctx: AppContext): () => void {
  const render = () => {
    root.innerHTML = '';
    const shows = ctx.store.shows;

    const toolbar = el('div', { class: 'toolbar' },
      button('＋ 新建节目', () => {
        const name = prompt('节目名称', `新节目 ${shows.length + 1}`);
        if (name !== null) {
          const show = ctx.store.add(name.trim() || `新节目 ${shows.length + 1}`);
          ctx.store.setCurrent(show.id);
          render();
        }
      }, 'primary'),
      button('导出工程', () => {
        const json = ctx.store.exportProject();
        downloadBlob(new Blob([json], { type: 'application/json' }),
          `dome-project-${new Date().toISOString().slice(0, 10)}.json`);
      }),
      button('导入工程', () => fileInput.click()),
    );

    const fileInput = el('input', { type: 'file', accept: '.json', style: { display: 'none' } }) as HTMLInputElement;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const n = ctx.store.importProject(await file.text());
        alert(`已导入 ${n} 个节目`);
        render();
      } catch (e) {
        alert(`导入失败: ${e instanceof Error ? e.message : e}`);
      }
      fileInput.value = '';
    });

    const table = el('table', { class: 'show-table' },
      el('thead', {}, el('tr', {},
        el('th', { text: '名称' }), el('th', { text: '时长' }), el('th', { text: '球幕' }),
        el('th', { text: '投影机' }), el('th', { text: '关键帧' }), el('th', { text: '更新时间' }),
        el('th', { text: '操作' }))),
      el('tbody', {},
        ...shows.map((s) => el('tr', { class: s.id === ctx.store.currentId ? 'current' : '' },
          el('td', {}, el('a', {
            href: '#/scene', text: s.name, class: 'show-link',
            onclick: () => ctx.store.setCurrent(s.id),
          })),
          el('td', { text: `${s.duration}s @ ${s.fps}fps` }),
          el('td', { text: `${s.dome.fovDeg}° / ${s.dome.tiltDeg}°倾角 / ${s.dome.resolution}px` }),
          el('td', { text: String(s.projectors.filter((p) => p.enabled).length) }),
          el('td', { text: String(s.keyframes.length) }),
          el('td', { text: formatDateTime(s.updatedAt) }),
          el('td', { class: 'actions' },
            button('打开', () => { ctx.store.setCurrent(s.id); ctx.navigate('scene'); }, 'small'),
            button('复制', () => { ctx.store.duplicate(s.id); render(); }, 'small'),
            button('重命名', () => {
              const name = prompt('新名称', s.name);
              if (name) { s.name = name; ctx.store.update(s); render(); }
            }, 'small'),
            button('删除', () => {
              if (confirm(`确定删除节目「${s.name}」?`)) { ctx.store.remove(s.id); render(); }
            }, 'small danger'),
          ),
        ))),
    );

    root.append(
      el('div', { class: 'page-header' },
        el('h2', { text: '节目列表' }),
        el('span', { class: 'muted', text: `共 ${shows.length} 个节目, 数据保存在浏览器本地` })),
      toolbar,
      shows.length ? table : el('p', { class: 'empty', text: '还没有节目, 点击「新建节目」开始。' }),
      fileInput,
    );
  };

  render();
  const off = ctx.store.onChange(render);
  return off;
}
