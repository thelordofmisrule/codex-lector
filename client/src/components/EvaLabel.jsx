export default function EvaLabel({
  as: Tag = "span",
  jp = "",
  children,
  className = "",
  englishClassName = "",
  jpClassName = "",
  ...props
}) {
  const wrapperClass = ["eva-bilingual", className].filter(Boolean).join(" ");
  const englishClass = ["eva-bilingual-en", englishClassName].filter(Boolean).join(" ");
  const japaneseClass = ["eva-bilingual-jp", jpClassName].filter(Boolean).join(" ");

  return (
    <Tag className={wrapperClass} {...props}>
      <span className={englishClass}>{children}</span>
      {jp ? (
        <span className={japaneseClass} lang="ja">
          {jp}
        </span>
      ) : null}
    </Tag>
  );
}
