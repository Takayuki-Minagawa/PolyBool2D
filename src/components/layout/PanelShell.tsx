type PanelShellProps = {
  children: React.ReactNode;
};

export function PanelShell({ children }: PanelShellProps) {
  return <aside className="panel">{children}</aside>;
}
