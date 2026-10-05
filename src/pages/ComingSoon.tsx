export default function ComingSoon({ title, step }: { title: string; step: number }) {
  return (
    <section className="page">
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <p className="muted">Coming in step {step} of the build plan.</p>
    </section>
  )
}
