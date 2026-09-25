"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const depsKey = JSON.stringify(deps);

  const requestKey = `${depsKey}#${version}`;

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

/** `value`, updated only after it has stopped changing for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
