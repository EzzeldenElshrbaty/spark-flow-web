/** "1 task", "5 tasks": `n` and its noun, with an s unless there's exactly one. */
export const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
