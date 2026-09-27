import { Component, type ErrorInfo, type ReactNode } from "react";
import { Surface } from "../ui/Surface.js";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("The local interface could not render.", error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <main id="main-content">
          <Surface role="alert">
            <h1>The learning space could not open.</h1>
            <p>Refresh the page. If it still fails, check the local terminal guidance.</p>
          </Surface>
        </main>
      );
    }
    return this.props.children;
  }
}
