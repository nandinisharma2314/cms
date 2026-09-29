"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig } from "./config";

type Dep = string | number | boolean | null | undefined;

/**
 * Loads data from the API whenever `deps` change or `reload()` is called.
 * Previous data stays visible while a reload is in flight.
 */
export function useApiData<T>(fetcher: () => Promise<T>, deps: Dep[]) {
  // `key` records which deps/version the data belongs to, so a refetch can be detected.
  const [state, setState] = useState<{ data: T | undefined; error: string | null; key: string | null }>({
    data: undefined,
    error: null,
    key: null,
  });
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const requestKey = `${JSON.stringify(deps)}#${version}`;

  useEffect(() => {
    let active = true;
    fetcherRef.current().then(
      (data) => active && setState({ data, error: null, key: requestKey }),
      (err: Error) => active && setState((prev) => ({ ...prev, error: err.message, key: requestKey })),
    );
    return () => {
      active = false;
    };
  }, [requestKey]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** Replace the data with a fresh copy, e.g. the response of a mutation. */
  const setData = useCallback((data: T) => setState((prev) => ({ data, error: null, key: prev.key })), []);
  return {
    data: state.data,
    error: state.error,
    loading: state.data === undefined && state.error === null,
    /** Showing older data while a new request is in flight. */
    refreshing: state.data !== undefined && state.key !== requestKey,
    reload,
    setData,
  };
}

/** `value`, updated only once it has stopped changing for the configured search delay. */
export function useDebounced<T>(value: T): T {
  const delay = useConfig().ui.search_debounce_ms;
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Runs an async action with busy/error state, for buttons and forms.
 * Resolves to true when the action succeeded.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
