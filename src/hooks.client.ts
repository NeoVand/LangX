import { installBrowserAsyncContext } from '$lib/runtime/async-context';

// Make LangGraph's interrupt() (HITL) work in the browser by giving it a
// synchronous async-context store. Must run before any graph executes.
installBrowserAsyncContext();
