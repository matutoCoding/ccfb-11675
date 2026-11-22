import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from 'react';

interface ToastMsg {
  id: number;
  text: string;
  tone: 'info' | 'err';
}

const ToastCtx = createContext<(text: string, tone?: 'info' | 'err') => void>(
  () => undefined,
);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);

  const push = useCallback((text: string, tone: 'info' | 'err' = 'info') => {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m, { id, text, tone }]);
    setTimeout(() => {
      setMsgs((m) => m.filter((x) => x.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {msgs.map((m) => (
        <div key={m.id} className={`toast ${m.tone === 'err' ? 'err' : ''}`}>
          {m.text}
        </div>
      ))}
    </ToastCtx.Provider>
  );
};

export const useToast = (): ((text: string, tone?: 'info' | 'err') => void) =>
  useContext(ToastCtx);
