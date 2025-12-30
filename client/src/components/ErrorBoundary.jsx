import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 border border-red-500/50 bg-red-500/10 rounded-lg text-red-200 text-xs font-mono overflow-auto max-h-[200px]">
                    <h3 className="font-bold mb-2">Component Crashed</h3>
                    {this.state.error && this.state.error.toString()}
                </div>
            );
        }

        return this.props.children;
    }
}
