interface UpdateBannerProps {
  onApply: () => void;
}

/**
 * 新しいビルド（＝新しい単価）が利用可能なことを知らせる。
 * 単価の改定を掴み損ねないよう、閉じるだけの選択肢は出さない。
 */
export default function UpdateBanner({ onApply }: UpdateBannerProps) {
  return (
    <div
      role="status"
      className="print-hide"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 16px',
        background: '#fef3c7',
        borderBottom: '1px solid #f59e0b',
        color: '#92400e',
        fontSize: '13px'
      }}
    >
      <span>新しい料金データがあります</span>
      <button
        className="primary"
        style={{ padding: '6px 14px', fontSize: '13px' }}
        onClick={onApply}
      >
        更新する
      </button>
    </div>
  )
}
