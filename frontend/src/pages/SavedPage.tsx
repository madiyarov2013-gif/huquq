

const SavedPage = () => {
  return (
    <div>
      <h1 className="page-title">Saqlanganlar</h1>
      <p className="page-subtitle">Siz saqlagan ma'lumotlar va qonunlar shu yerda ko'rinadi.</p>
      <div className="empty-state" style={{ marginTop: '40px', textAlign: 'center', color: '#64748b', padding: '40px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <p>Hozircha saqlangan ma'lumotlar yo'q</p>
      </div>
    </div>
  );
};

export default SavedPage;
