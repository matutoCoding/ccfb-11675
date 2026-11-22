import { Component, ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** 捕获 WebGL 初始化/渲染异常，给出可读提示而不是白屏 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // 保留在控制台，便于排查着色器/上下文问题
    console.error('渲染错误边界捕获：', error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            margin: 16,
            border: '1px solid #5a2d33',
            borderRadius: 8,
            background: '#1c1418',
            color: '#ffb0b0',
          }}
        >
          <h3 style={{ marginTop: 0 }}>WebGL 渲染失败</h3>
          <p style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>
            {this.state.error.message}
          </p>
          <p className="muted">
            请确认浏览器支持 WebGL2（Chrome/Edge/Firefox 最新版），并更新显卡驱动。
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
