"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./navigation.module.css";

export type TabItem = { value: string; label: ReactNode; panel: ReactNode; disabled?: boolean };

type TabsProps = { items: TabItem[]; label: string; defaultValue?: string; className?: string };

export function Tabs({ className, defaultValue, items, label }: TabsProps) {
  const firstEnabled = items.find((item) => !item.disabled)?.value;
  const [value, setValue] = useState(defaultValue && items.some((item) => item.value === defaultValue && !item.disabled) ? defaultValue : firstEnabled);
  const baseId = useId().replaceAll(":", "");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = items.find((item) => item.value === value) ?? items.find((item) => !item.disabled);
  if (!active) return null;

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => !item.disabled);
    const position = enabled.findIndex(({ itemIndex }) => itemIndex === index);
    let next = position;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (position + 1) % enabled.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (position - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[next];
    setValue(target.item.value);
    tabs.current[target.itemIndex]?.focus();
  }

  return <div className={`${styles.tabs}${className ? ` ${className}` : ""}`}>
    <div aria-label={label} className={styles.tabList} role="tablist">
      {items.map((item, index) => <button aria-controls={`${baseId}-${item.value}-panel`} aria-selected={item.value === active.value} className={styles.tab} disabled={item.disabled} id={`${baseId}-${item.value}-tab`} key={item.value} onClick={() => setValue(item.value)} onKeyDown={(event) => move(event, index)} ref={(element) => { tabs.current[index] = element; }} role="tab" tabIndex={item.value === active.value ? 0 : -1} type="button">{item.label}</button>)}
    </div>
    {items.map((item) => <div aria-labelledby={`${baseId}-${item.value}-tab`} className={styles.tabPanel} hidden={item.value !== active.value} id={`${baseId}-${item.value}-panel`} key={item.value} role="tabpanel">{item.panel}</div>)}
  </div>;
}
