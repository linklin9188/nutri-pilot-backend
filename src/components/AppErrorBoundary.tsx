/**
 * AppErrorBoundary — 全局渲染错误兜底。
 *
 * 任何子树在渲染/生命周期里抛未捕获异常时, 不再整页白屏, 而是把
 * 错误信息 + 组件栈直接显示在屏幕上 (方便非技术用户截图反馈, 不必开 F12)。
 * 同时打到 console.error 保留原始堆栈。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null; info: ErrorInfo | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留原始堆栈到控制台
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary]', error, info);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', background: '#FFF5F5', color: '#7F1D1D',
        padding: '24px 18px', fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        <p style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>⚠️ 页面出错了（把这段截图发我）</p>
        <p style={{ fontWeight: 700, color: '#DC2626' }}>{error.name}: {error.message}</p>
        {error.stack && (
          <details open style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>错误堆栈</summary>
            <div style={{ marginTop: 6 }}>{error.stack}</div>
          </details>
        )}
        {info?.componentStack && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>组件栈</summary>
            <div style={{ marginTop: 6 }}>{info.componentStack}</div>
          </details>
        )}
        <button onClick={() => location.assign('/login-v2')}
          style={{ marginTop: 18, padding: '10px 16px', borderRadius: 12, background: '#FF5A1F', color: '#fff', fontWeight: 700, border: 'none' }}>
          回登录页
        </button>
      </div>
    );
  }
}
