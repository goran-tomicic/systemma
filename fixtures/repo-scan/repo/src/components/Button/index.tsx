import styles from './Button.module.css';

const GAP = 'space.4';
const NOT_A_TOKEN = 'some.other.thing';

export function Button() {
  return <button className={styles.button} style={{ padding: 'var(--space-4)', color: 'var(--color-fg-muted)' }} data-gap={GAP} />;
}
