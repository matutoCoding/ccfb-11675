import { useRef } from 'react';
import { studioStore, useStudio } from '../state/store';
import { exportProjectFile, importProjectFile } from '../state/storage';
import { useToast } from '../ui/Toast';
import { Card, Pill } from '../ui/controls';
import { ShowProject } from '../types';

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export const ShowsPage = () => {
  const lib = useStudio();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    try {
      const project = await importProjectFile(file);
      studioStore.importShow(project);
      toast(`已导入工程：${project.name}`);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <div className="page">
      <Card
        title="节目库"
        extra={
          <div className="row" style={{ margin: 0 }}>
            <button
              className="primary"
              onClick={() => studioStore.createShow()}
            >
              ＋ 新建节目
            </button>
            <button onClick={() => fileRef.current?.click()}>
              ⬆ 导入工程
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
          </div>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>节目名称</th>
              <th>场景数</th>
              <th>FOV</th>
              <th>球幕直径</th>
              <th>更新时间</th>
              <th style={{ width: 300 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {lib.shows.map((s: ShowProject) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  {s.id === lib.activeId && (
                    <Pill tone="ok">当前编辑</Pill>
                  )}
                </td>
                <td>{s.scenes.length}</td>
                <td>{s.settings.fov}°</td>
                <td>{s.settings.domeDiameterM} m</td>
                <td className="muted">{fmtDate(s.updatedAt)}</td>
                <td>
                  <div className="row" style={{ margin: 0, gap: 6 }}>
                    <button
                      onClick={() => studioStore.selectShow(s.id)}
                      disabled={s.id === lib.activeId}
                    >
                      打开
                    </button>
                    <button
                      onClick={() => {
                        const name = window.prompt('节目名称', `${s.name} 副本`);
                        if (name) {
                          // 复制后改名
                          studioStore.duplicateShow(s.id);
                          studioStore.updateActive((d) => {
                            d.name = name;
                          });
                        }
                      }}
                    >
                      复制
                    </button>
                    <button onClick={() => exportProjectFile(s)}>
                      导出
                    </button>
                    <button
                      className="danger"
                      disabled={lib.shows.length <= 1}
                      onClick={() => {
                        if (
                          window.confirm(`确定删除节目「${s.name}」？该操作不可恢复。`)
                        ) {
                          studioStore.deleteShow(s.id);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12 }}>
          工程保存在浏览器 localStorage 中，清理浏览器数据会丢失，请及时使用「导出」备份为 .dome.json 文件。
        </p>
      </Card>
    </div>
  );
};
