import React, { Component } from "react";
import { cn } from "../../lib/utils";

type LazyLoadBoundaryProps = {
  children: React.ReactNode;
  className?: string;
  fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
  name?: string;
  resetKey?: React.Key | null;
};

type LazyLoadBoundaryState = {
  error: Error | null;
  retryKey: number;
};

export class LazyLoadBoundary extends Component<LazyLoadBoundaryProps, LazyLoadBoundaryState> {
  declare props: Readonly<LazyLoadBoundaryProps>;
  declare setState: React.Component<LazyLoadBoundaryProps, LazyLoadBoundaryState>["setState"];
  state: LazyLoadBoundaryState = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<LazyLoadBoundaryState> {
    return { error };
  }

  componentDidUpdate(prevProps: LazyLoadBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    // Soft remount only. Full window.location.reload() rehydrates huge AI session
    // payloads (image base64 in localStorage) and often freezes into a white screen.
    this.setState(({ retryKey }) => ({ error: null, retryKey: retryKey + 1 }));
  };

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[LazyLoadBoundary] ${this.props.name || "content"} failed:`, error, errorInfo.componentStack);
    try {
      const bridge = (window as unknown as {
        netcatty?: {
          logDiagnostic?: (payload: {
            source: string;
            message: string;
            extra?: Record<string, unknown>;
          }) => void | Promise<unknown>;
        };
      }).netcatty;
      void bridge?.logDiagnostic?.({
        source: `lazy-load:${this.props.name || "content"}`,
        message: error?.message || String(error),
        extra: {
          stack: error?.stack,
          componentStack: errorInfo.componentStack,
        },
      });
    } catch {
      // never throw from the error boundary
    }
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") return fallback(this.state.error);
      if (fallback) return fallback;
      const label = this.props.name || "This area";
      return (
        <div
          className={cn(
            "flex h-full min-h-[120px] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground",
            this.props.className,
          )}
          role="alert"
        >
          <div className="font-medium text-foreground">{label} could not load.</div>
          {this.state.error?.message ? (
            <div className="max-w-full break-all text-[11px] text-muted-foreground/80" title={this.state.error.message}>
              {this.state.error.message}
            </div>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            onClick={this.retry}
          >
            Retry
          </button>
        </div>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}
