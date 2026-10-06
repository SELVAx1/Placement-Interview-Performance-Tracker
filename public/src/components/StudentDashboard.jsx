function StudentDashboard({ user, onLogout }) {
    // Navigation Tabs: 'drives', 'results', 'applications', 'analysis', 'interventions', 'profile'
    const [activeTab, setActiveTab] = React.useState('drives');

    // Data states
    const [allDrives, setAllDrives] = React.useState([]);
    const [myResults, setMyResults] = React.useState([]);
    const [myApplications, setMyApplications] = React.useState([]);
    const [analysisData, setAnalysisData] = React.useState(null);
    const [interventions, setInterventions] = React.useState([]);
    const [studentProfile, setStudentProfile] = React.useState(null);

    // Profile Edit Mode States
    const [isEditingProfile, setIsEditingProfile] = React.useState(false);
    const [savingProfile, setSavingProfile] = React.useState(false);
    const [profileFormData, setProfileFormData] = React.useState({});

    // Resume Upload State
    const [resumeFile, setResumeFile] = React.useState(null);
    const [uploadingResume, setUploadingResume] = React.useState(false);

    const [loading, setLoading] = React.useState(true);
    const [toastMessage, setToastMessage] = React.useState('');

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(''), 3500);
    };

    // Fetch Student Dashboard Data
    const fetchDashboardData = React.useCallback(async () => {
        setLoading(true);
        try {
            const gmail = user?.gmail || 'student@gmail.com';

            // 1. Fetch drives
            const resDrives = await fetch('/api/drives');
            if (resDrives.ok) {
                const dData = await resDrives.json();
                setAllDrives(dData.drives || []);
            }

            // 2. Fetch student results
            const resResults = await fetch(`/api/student/results?gmail=${encodeURIComponent(gmail)}`);
            if (resResults.ok) {
                const rData = await resResults.json();
                setMyResults(rData.results || []);
            }

            // 3. Fetch applications or generate from results
            const resApps = await fetch(`/api/student/applications?gmail=${encodeURIComponent(gmail)}`);
            if (resApps.ok) {
                const aData = await resApps.json();
                setMyApplications(aData.applications || []);
            }

            // 4. Fetch analysis data
            const resAnalysis = await fetch(`/api/student/analysis?gmail=${encodeURIComponent(gmail)}`);
            if (resAnalysis.ok) {
                const anData = await resAnalysis.json();
                setAnalysisData(anData);
            } else {
                setAnalysisData({
                    pass_rate: 0,
                    total_drives_applied: 0,
                    total_rounds_attempted: 0,
                    rounds_passed: 0,
                    rounds_failed: 0,
                    most_failed_round: "None",
                    top_weaknesses: [],
                    risk_level: "low"
                });
            }

            const resInterventions = await fetch(`/api/interventions/${encodeURIComponent(user?.uuid || '')}`, {
                headers: window.interventionHeaders ? window.interventionHeaders(user) : {}
            });
            if (resInterventions.ok) {
                const interventionData = await resInterventions.json();
                setInterventions(interventionData.interventions || []);
            } else {
                setInterventions([]);
            }

            // 5. Fetch student profile from database (updated by coordinator roster & student)
            const resProfile = await fetch(`/api/student/profile?gmail=${encodeURIComponent(gmail)}`);
            if (resProfile.ok) {
                const pData = await resProfile.json();
                const prof = pData.profile || {};
                const loadedProfile = {
                    name: prof.name || user?.name || gmail.split('@')[0].replace('.', ' ').toUpperCase(),
                    email: prof.email || gmail,
                    phone: prof.phone || '',
                    register_number: prof.register_number || '',
                    department: prof.department || '',
                    year: prof.year || '4th Year',
                    cgpa: prof.cgpa !== undefined && prof.cgpa !== null ? prof.cgpa : null,
                    tenth: prof.tenth_percentage !== undefined && prof.tenth_percentage !== null ? prof.tenth_percentage : null,
                    twelfth: prof.twelfth_percentage !== undefined && prof.twelfth_percentage !== null ? prof.twelfth_percentage : null,
                    skills: prof.skills_list && prof.skills_list.length > 0 ? prof.skills_list : (prof.skills ? prof.skills.split(',').map(s => s.trim()).filter(Boolean) : []),
                    skills_raw: prof.skills || '',
                    linkedin_url: prof.linkedin_url || '',
                    github_url: prof.github_url || '',
                    portfolio_url: prof.portfolio_url || '',
                    resume_filename: prof.resume_filename || prof.resume_path || null,
                    resume_url: prof.resume_url || null,
                    // Coding platform metrics
                    leetcode_handle: prof.leetcode_handle || '',
                    leetcode_solved_month: prof.leetcode_solved_month || 0,
                    leetcode_total_solved: prof.leetcode_total_solved || 0,
                    codeforces_handle: prof.codeforces_handle || '',
                    codeforces_solved_month: prof.codeforces_solved_month || 0,
                    codeforces_rating: prof.codeforces_rating || 0,
                    codechef_handle: prof.codechef_handle || '',
                    codechef_solved_month: prof.codechef_solved_month || 0,
                    codechef_stars: prof.codechef_stars || '',
                    hackerrank_handle: prof.hackerrank_handle || '',
                    hackerrank_solved_month: prof.hackerrank_solved_month || 0,
                    hackerrank_score: prof.hackerrank_score || 0,
                    atcoder_handle: prof.atcoder_handle || '',
                    atcoder_solved_month: prof.atcoder_solved_month || 0,
                    atcoder_rating: prof.atcoder_rating || 0,
                    monthly_total_solved: prof.monthly_total_solved || 0
                };
                setStudentProfile(loadedProfile);
            }

        } catch (err) {
            console.error('Error loading student workspace:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    React.useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // Handle Job Application
    const handleApplyDrive = async (drive) => {
        const studentCgpa = studentProfile?.cgpa || 8.4;
        if (drive.min_cgpa && studentCgpa < drive.min_cgpa) {
            showToast(`Application Failed: CGPA (${studentCgpa}) is below required minimum (${drive.min_cgpa})`);
            return;
        }

        try {
            const res = await fetch('/api/student/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gmail: user.gmail,
                    drive_id: drive.id
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(`Successfully registered for ${drive.company_name}!`);
                setMyApplications(prev => [{
                    drive_id: drive.id,
                    company_name: drive.company_name,
                    job_role: drive.job_role,
                    ctc_lpa: drive.ctc_lpa,
                    final_status: 'REGISTERED',
                    registered_at: new Date().toISOString().substring(0, 10)
                }, ...prev]);
            } else {
                showToast(data.message || `Registered for ${drive.company_name}`);
                setMyApplications(prev => [{
                    drive_id: drive.id,
                    company_name: drive.company_name,
                    job_role: drive.job_role,
                    ctc_lpa: drive.ctc_lpa,
                    final_status: 'REGISTERED',
                    registered_at: new Date().toISOString().substring(0, 10)
                }, ...prev]);
            }
        } catch (e) {
            showToast(`Registered for ${drive.company_name}`);
        }
    };

    // Start editing profile
    const handleStartEditProfile = () => {
        if (!studentProfile) return;
        setProfileFormData({
            name: studentProfile.name || '',
            phone: studentProfile.phone || '',
            department: studentProfile.department || '',
            year: studentProfile.year || '4th Year',
            cgpa: studentProfile.cgpa !== null && studentProfile.cgpa !== undefined ? studentProfile.cgpa : '',
            tenth: studentProfile.tenth !== null && studentProfile.tenth !== undefined ? studentProfile.tenth : '',
            twelfth: studentProfile.twelfth !== null && studentProfile.twelfth !== undefined ? studentProfile.twelfth : '',
            skills: studentProfile.skills_raw || (Array.isArray(studentProfile.skills) ? studentProfile.skills.join(', ') : ''),
            linkedin_url: studentProfile.linkedin_url || '',
            github_url: studentProfile.github_url || '',
            portfolio_url: studentProfile.portfolio_url || '',
            // Coding Platforms
            leetcode_handle: studentProfile.leetcode_handle || '',
            leetcode_solved_month: studentProfile.leetcode_solved_month || 0,
            leetcode_total_solved: studentProfile.leetcode_total_solved || 0,
            codeforces_handle: studentProfile.codeforces_handle || '',
            codeforces_solved_month: studentProfile.codeforces_solved_month || 0,
            codeforces_rating: studentProfile.codeforces_rating || 0,
            codechef_handle: studentProfile.codechef_handle || '',
            codechef_solved_month: studentProfile.codechef_solved_month || 0,
            codechef_stars: studentProfile.codechef_stars || '',
            hackerrank_handle: studentProfile.hackerrank_handle || '',
            hackerrank_solved_month: studentProfile.hackerrank_solved_month || 0,
            hackerrank_score: studentProfile.hackerrank_score || 0,
            atcoder_handle: studentProfile.atcoder_handle || '',
            atcoder_solved_month: studentProfile.atcoder_solved_month || 0,
            atcoder_rating: studentProfile.atcoder_rating || 0
        });
        setIsEditingProfile(true);
    };

    // Save profile changes to backend
    const handleSaveProfile = async (e) => {
        if (e) e.preventDefault();
        setSavingProfile(true);
        try {
            const gmail = user?.gmail || 'student@gmail.com';
            const payload = {
                gmail: gmail,
                name: profileFormData.name,
                phone: profileFormData.phone,
                year: profileFormData.year,
                skills: profileFormData.skills,
                linkedin_url: profileFormData.linkedin_url,
                github_url: profileFormData.github_url,
                portfolio_url: profileFormData.portfolio_url,
                leetcode_handle: profileFormData.leetcode_handle,
                leetcode_solved_month: parseInt(profileFormData.leetcode_solved_month || 0, 10),
                leetcode_total_solved: parseInt(profileFormData.leetcode_total_solved || 0, 10),
                codeforces_handle: profileFormData.codeforces_handle,
                codeforces_solved_month: parseInt(profileFormData.codeforces_solved_month || 0, 10),
                codeforces_rating: parseInt(profileFormData.codeforces_rating || 0, 10),
                codechef_handle: profileFormData.codechef_handle,
                codechef_solved_month: parseInt(profileFormData.codechef_solved_month || 0, 10),
                codechef_stars: profileFormData.codechef_stars,
                hackerrank_handle: profileFormData.hackerrank_handle,
                hackerrank_solved_month: parseInt(profileFormData.hackerrank_solved_month || 0, 10),
                hackerrank_score: parseInt(profileFormData.hackerrank_score || 0, 10),
                atcoder_handle: profileFormData.atcoder_handle,
                atcoder_solved_month: parseInt(profileFormData.atcoder_solved_month || 0, 10),
                atcoder_rating: parseInt(profileFormData.atcoder_rating || 0, 10)
            };

            const res = await fetch('/api/student/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Profile and coding statistics saved successfully!');
                const p = data.profile;
                setStudentProfile(prev => ({
                    ...prev,
                    ...p,
                    tenth: p.tenth_percentage,
                    twelfth: p.twelfth_percentage,
                    skills: p.skills_list || (p.skills ? p.skills.split(',').map(s => s.trim()).filter(Boolean) : []),
                    skills_raw: p.skills || ''
                }));
                setIsEditingProfile(false);
            } else {
                showToast(data.message || 'Failed to update profile.');
            }
        } catch (err) {
            console.error('Error updating profile:', err);
            showToast('Network error while saving profile.');
        } finally {
            setSavingProfile(false);
        }
    };

    // Handle Resume Upload
    const handleResumeUploadSubmit = async (e) => {
        e.preventDefault();
        if (!resumeFile) return;
        setUploadingResume(true);
        try {
            const formData = new FormData();
            formData.append('file', resumeFile);
            formData.append('gmail', user?.gmail || 'student@gmail.com');

            const res = await fetch('/api/student/resume-upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Resume uploaded and attached to profile successfully!');
                setStudentProfile(prev => ({
                    ...prev,
                    resume_filename: data.resume_filename || data.resume_path || resumeFile.name,
                    resume_url: data.resume_url || prev.resume_url
                }));
            } else {
                showToast(data.message || 'Resume uploaded!');
                setStudentProfile(prev => ({ ...prev, resume_filename: resumeFile.name }));
            }
        } catch (err) {
            showToast('Resume uploaded!');
            setStudentProfile(prev => ({ ...prev, resume_filename: resumeFile.name }));
        } finally {
            setUploadingResume(false);
            setResumeFile(null);
        }
    };

    // Derived Placement Status
    const isPlacedRecord = (r) => {
        const res = (r.result || '').toLowerCase();
        if (res.includes('not select') || res.includes('reject') || res.includes('fail')) return false;
        return res.includes('select') || res.includes('placed') || res.includes('hired') || res.includes('offer');
    };
    const placedResult = myResults.find(isPlacedRecord);
    const placementStatus = placedResult
        ? `Placed @ ${placedResult.company_name}`
        : myApplications.length > 0
            ? 'In Progress'
            : 'Unplaced';

    return (
        <div className="laptop-dashboard">
            {/* Top Header Navbar */}
            <header className="desktop-navbar">
                <div className="nav-left">
                    <div className="brand-icon" title="Placement Intervention System">
                        <img src="/static/icon.png" alt="Placement Intervention System" />
                    </div>
                    <div className="brand-text">
                        <span className="portal-name">Placement Intervention System</span>
                        <span className="portal-sub">
                            Student Portal &bull; <span className="brand-tagline-badge">Prepare &bull; Succeed</span>
                        </span>
                    </div>
                </div>

                {/* Navbar Navigation Tabs */}
                <div className="nav-tabs" style={{ display: 'flex', gap: '8px' }}>
                    {[
                        { id: 'drives', label: `Active Drives (${allDrives.length})` },
                        { id: 'results', label: `Round Results (${myResults.length})` },
                        { id: 'applications', label: `My Applications (${myApplications.length})` },
                        { id: 'analysis', label: 'Performance Analysis' },
                        { id: 'interventions', label: `My Interventions (${interventions.length})` },
                        { id: 'profile', label: 'Profile & Resume' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '6px',
                                background: activeTab === tab.id ? '#2563eb' : 'transparent',
                                color: activeTab === tab.id ? '#ffffff' : '#94a3b8',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.875rem'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="nav-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="user-avatar" style={{ background: '#2563eb', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            {user?.name ? user.name[0].toUpperCase() : 'S'}
                        </div>
                        <div className="user-info">
                            <span className="user-name" style={{ fontWeight: '600', color: '#f8fafc' }}>{user?.gmail || 'student@gmail.com'}</span>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                                <span className="user-role-badge" style={{ background: '#059669', color: '#fff', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px' }}>Student</span>
                                <span className="status-badge" style={{
                                    background: placedResult ? 'rgba(16, 185, 129, 0.2)' : myApplications.length > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                                    color: placedResult ? '#34d399' : myApplications.length > 0 ? '#60a5fa' : '#94a3b8',
                                    border: `1px solid ${placedResult ? 'rgba(16, 185, 129, 0.4)' : myApplications.length > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(148, 163, 184, 0.4)'}`,
                                    fontSize: '0.75rem',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontWeight: 'bold'
                                }}>
                                    {placementStatus}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button type="button" className="logout-btn" onClick={onLogout} style={{ padding: '8px 14px', borderRadius: '6px', background: '#334155', color: '#f8fafc', border: 'none', cursor: 'pointer' }}>
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Toast Notification */}
            {toastMessage && (
                <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, background: '#2563eb', color: '#fff', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontWeight: '600' }}>
                    {toastMessage}
                </div>
            )}

            {/* MAIN DASHBOARD CONTENT */}
            <main className="dashboard-body" style={{ marginTop: '20px' }}>

                {/* TAB 1: ACTIVE DRIVES & DIRECT APPLY */}
                {activeTab === 'drives' && (
                    <div className="card" style={{ background: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ color: '#f8fafc', fontSize: '1.25rem' }}>Active Recruitment Drives</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Apply for open campus placement opportunities.</p>
                            </div>
                        </div>

                        {loading ? (
                            <p style={{ color: '#94a3b8' }}>Loading placement drives...</p>
                        ) : allDrives.length === 0 ? (
                            <p style={{ color: '#64748b' }}>No active recruitment drives currently open.</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            <th style={{ padding: '12px' }}>COMPANY</th>
                                            <th style={{ padding: '12px' }}>JOB ROLE</th>
                                            <th style={{ padding: '12px' }}>PACKAGE (CTC)</th>
                                            <th style={{ padding: '12px' }}>MIN CGPA</th>
                                            <th style={{ padding: '12px' }}>LOCATION</th>
                                            <th style={{ padding: '12px' }}>ROUND</th>
                                            <th style={{ padding: '12px', textAlign: 'right' }}>ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allDrives.map(d => {
                                            const isEligible = !d.min_cgpa || (studentProfile?.cgpa ? studentProfile.cgpa >= d.min_cgpa : true);
                                            const isApplied = myApplications.some(a => a.drive_id === d.id);

                                            return (
                                                <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>
                                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{d.company_name}</td>
                                                    <td style={{ padding: '12px' }}>{d.job_role}</td>
                                                    <td style={{ padding: '12px', color: '#34d399', fontWeight: 'bold' }}>₹{d.ctc_lpa} LPA</td>
                                                    <td style={{ padding: '12px' }}>{d.min_cgpa || 'Open'}</td>
                                                    <td style={{ padding: '12px' }}>{d.location}</td>
                                                    <td style={{ padding: '12px' }}>
                                                        <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                            Round {d.current_round || 1}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                                        {isApplied ? (
                                                            <span style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                                Applied &check;
                                                            </span>
                                                        ) : isEligible ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApplyDrive(d)}
                                                                style={{ padding: '6px 14px', borderRadius: '6px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}
                                                            >
                                                                Apply Now
                                                            </button>
                                                        ) : (
                                                            <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: '500' }}>
                                                                CGPA Below {d.min_cgpa}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: MY ROUND RESULTS */}
                {activeTab === 'results' && (
                    <div className="card" style={{ background: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '8px' }}>Drive Shortlists & Evaluation Results</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '20px' }}>Your round-by-round status updates uploaded by placement coordinators.</p>

                        {myResults.length === 0 ? (
                            <p style={{ color: '#64748b' }}>No round evaluation results published yet.</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            <th style={{ padding: '12px' }}>COMPANY</th>
                                            <th style={{ padding: '12px' }}>JOB ROLE</th>
                                            <th style={{ padding: '12px' }}>ROUND NO</th>
                                            <th style={{ padding: '12px' }}>RESULT VERDICT</th>
                                            <th style={{ padding: '12px', textAlign: 'right' }}>LAST UPDATED</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {myResults.map((r, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>
                                                <td style={{ padding: '12px', fontWeight: 'bold' }}>{r.company_name}</td>
                                                <td style={{ padding: '12px' }}>{r.job_role}</td>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                        Round {r.round || 1}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        background: (() => {
                                                            const res = (r.result || '').toLowerCase();
                                                            const isNeg = res.includes('not select') || res.includes('reject') || res.includes('fail');
                                                            if (isNeg) return 'rgba(239,68,68,0.2)';
                                                            if (res.includes('applied') || res.includes('registered') || res.includes('in progress')) {
                                                                return 'rgba(56,189,248,0.2)';
                                                            }
                                                            const isPos = res.includes('select') || res.includes('shortlist') || res.includes('placed') || res.includes('offer') || res.includes('pass') || res.includes('clear');
                                                            return isPos ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.2)';
                                                        })(),
                                                        color: (() => {
                                                            const res = (r.result || '').toLowerCase();
                                                            const isNeg = res.includes('not select') || res.includes('reject') || res.includes('fail');
                                                            if (isNeg) return '#f87171';
                                                            if (res.includes('applied') || res.includes('registered') || res.includes('in progress')) {
                                                                return '#38bdf8';
                                                            }
                                                            const isPos = res.includes('select') || res.includes('shortlist') || res.includes('placed') || res.includes('offer') || res.includes('pass') || res.includes('clear');
                                                            return isPos ? '#34d399' : '#94a3b8';
                                                        })()
                                                    }}>
                                                        {r.result}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8', fontSize: '0.8rem' }}>
                                                    {r.updated_at}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: MY APPLIED DRIVES */}
                {activeTab === 'applications' && (
                    <div className="card" style={{ background: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '8px' }}>My Drive Applications</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '20px' }}>Tracking status for drives you have registered for.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                            {myApplications.map((app, idx) => (
                                <div key={idx} style={{ background: '#0f172a', padding: '18px', borderRadius: '8px', border: '1px solid #334155' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h4 style={{ color: '#f8fafc', fontSize: '1.05rem', fontWeight: 'bold' }}>{app.company_name}</h4>
                                        <span style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            {app.final_status || 'REGISTERED'}
                                        </span>
                                    </div>
                                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>Role: {app.job_role || 'SDE'}</p>
                                    <p style={{ color: '#34d399', fontWeight: 'bold', fontSize: '0.9rem', marginTop: '4px' }}>₹{app.ctc_lpa || '12.0'} LPA</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB 4: FAILURE & PERFORMANCE ANALYSIS */}
                {activeTab === 'analysis' && analysisData && (
                    <div className="card" style={{ background: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', marginBottom: '20px' }}>Performance & Failure Pattern Analysis</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Round Pass Rate</span>
                                <h4 style={{ fontSize: '2rem', color: '#34d399', marginTop: '6px' }}>{analysisData.pass_rate}%</h4>
                            </div>
                            <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Primary Weakness Round</span>
                                <h4 style={{ fontSize: '1.1rem', color: '#f59e0b', marginTop: '6px' }}>{analysisData.most_failed_round || 'Aptitude'}</h4>
                            </div>
                            <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Assessed Risk Level</span>
                                <h4 style={{ fontSize: '1.2rem', color: analysisData.risk_level === 'high' ? '#ef4444' : '#60a5fa', marginTop: '6px', textTransform: 'uppercase' }}>
                                    {analysisData.risk_level} Risk
                                </h4>
                            </div>
                        </div>

                        <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                            <h4 style={{ color: '#cbd5e1', fontSize: '1rem', marginBottom: '12px' }}>Identified Concept Weakness Areas:</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {(analysisData.top_weaknesses || []).map((w, i) => (
                                    <span key={i} style={{ background: '#1e293b', color: '#f8fafc', padding: '6px 14px', borderRadius: '20px', border: '1px solid #334155', fontSize: '0.85rem' }}>
                                        {w.area} &bull; <strong style={{ color: '#f87171' }}>{w.count} flags</strong>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'interventions' && (
                    <InterventionRoster
                        user={user}
                        canGenerate={false}
                        title="My Intervention Plan"
                        description="Only your own intervention is visible here. Actions and status are read-only."
                    />
                )}

                {/* TAB 5: PERSONAL INFO & ACADEMIC PROFILE & CODING PLATFORMS */}
                {activeTab === 'profile' && studentProfile && (
                    <div className="card" style={{ background: '#1e293b', padding: '24px', borderRadius: '10px', border: '1px solid #334155' }}>
                        {/* Header with Title and Edit Mode Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', margin: 0 }}>Student Profile & Coding Platform Activity</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '4px' }}>
                                    Manage your personal credentials, resume document, and competitive coding handles across LeetCode, Codeforces, CodeChef, HackerRank & AtCoder.
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {!isEditingProfile ? (
                                    <button
                                        type="button"
                                        onClick={handleStartEditProfile}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '8px 18px',
                                            borderRadius: '6px',
                                            background: '#2563eb',
                                            color: '#ffffff',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                            fontSize: '0.88rem',
                                            boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                        Edit Personal Data & Coding Handles
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={handleSaveProfile}
                                            disabled={savingProfile}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '8px 18px',
                                                borderRadius: '6px',
                                                background: '#10b981',
                                                color: '#ffffff',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '0.88rem'
                                            }}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                            {savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingProfile(false)}
                                            style={{
                                                padding: '8px 16px',
                                                borderRadius: '6px',
                                                background: '#475569',
                                                color: '#f8fafc',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '0.88rem'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Top Summary Banner */}
                        <div style={{ background: '#0f172a', padding: '20px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 'bold', fontSize: '1.5rem', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}>
                                    {studentProfile.name ? studentProfile.name.charAt(0).toUpperCase() : 'S'}
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <h4 style={{ color: '#f8fafc', fontSize: '1.25rem', margin: 0, fontWeight: '700' }}>{studentProfile.name}</h4>
                                        <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                            Verified Candidate
                                        </span>
                                    </div>
                                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                                        {studentProfile.email || user.gmail} &bull; Reg: <strong style={{ color: '#60a5fa' }}>{studentProfile.register_number || 'N/A'}</strong> &bull; {studentProfile.year || '4th Year'}
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                    Dept: {studentProfile.department || 'Not Assigned'}
                                </span>
                                <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                    CGPA: {studentProfile.cgpa !== null && studentProfile.cgpa !== undefined ? studentProfile.cgpa : 'N/A'}
                                </span>
                                {studentProfile.phone && (
                                    <span style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.3)', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                        📞 {studentProfile.phone}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* ============================================================== */}
                        {/* SECTION 1: CODING PLATFORMS & MONTHLY PROBLEM SOLVING ENGINE   */}
                        {/* ============================================================== */}
                        <div style={{ background: '#0f172a', padding: '22px', borderRadius: '10px', border: '1px solid #3b82f6', marginBottom: '24px', boxShadow: '0 4px 20px rgba(37,99,235,0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <h4 style={{ color: '#60a5fa', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px' }}>
                                            <polyline points="16 18 22 12 16 6"></polyline>
                                            <polyline points="8 6 2 12 8 18"></polyline>
                                        </svg>
                                        Competitive Coding Profiles & Monthly Activity Tracker
                                    </h4>
                                    <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '4px' }}>
                                        Visible at any time to Placement Coordinators, Department heads, and Mentors to monitor practical coding consistency.
                                    </p>
                                </div>

                                {/* Monthly Total Solved Highlight Counter */}
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(124, 58, 237, 0.25))',
                                    border: '1px solid #3b82f6',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                    textAlign: 'right'
                                }}>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Total Solved This Month
                                    </div>
                                    <div style={{ color: '#38bdf8', fontSize: '1.75rem', fontWeight: '800', lineHeight: 1.1 }}>
                                        🔥 {isEditingProfile
                                            ? ((parseInt(profileFormData.leetcode_solved_month || 0, 10) || 0) +
                                               (parseInt(profileFormData.codeforces_solved_month || 0, 10) || 0) +
                                               (parseInt(profileFormData.codechef_solved_month || 0, 10) || 0) +
                                               (parseInt(profileFormData.hackerrank_solved_month || 0, 10) || 0) +
                                               (parseInt(profileFormData.atcoder_solved_month || 0, 10) || 0))
                                            : (studentProfile.monthly_total_solved || 0)
                                        } <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'normal' }}>Problems</span>
                                    </div>
                                </div>
                            </div>

                            {/* View Mode: 5 Coding Platform Cards */}
                            {!isEditingProfile ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
                                    {/* 1. LeetCode */}
                                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.95rem' }}>LeetCode</span>
                                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                                +{studentProfile.leetcode_solved_month || 0} this mo
                                            </span>
                                        </div>
                                        <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: '600' }}>
                                            {studentProfile.leetcode_handle ? `@${studentProfile.leetcode_handle}` : <span style={{ color: '#64748b' }}>Not linked</span>}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px' }}>
                                            Total Solved: <strong style={{ color: '#cbd5e1' }}>{studentProfile.leetcode_total_solved || 0}</strong>
                                        </div>
                                    </div>

                                    {/* 2. Codeforces */}
                                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '0.95rem' }}>Codeforces</span>
                                            <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                                +{studentProfile.codeforces_solved_month || 0} this mo
                                            </span>
                                        </div>
                                        <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: '600' }}>
                                            {studentProfile.codeforces_handle ? `@${studentProfile.codeforces_handle}` : <span style={{ color: '#64748b' }}>Not linked</span>}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px' }}>
                                            Rating: <strong style={{ color: '#cbd5e1' }}>{studentProfile.codeforces_rating || 0}</strong>
                                        </div>
                                    </div>

                                    {/* 3. CodeChef */}
                                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ color: '#fb923c', fontWeight: 'bold', fontSize: '0.95rem' }}>CodeChef</span>
                                            <span style={{ background: 'rgba(251, 146, 60, 0.15)', color: '#fb923c', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                                +{studentProfile.codechef_solved_month || 0} this mo
                                            </span>
                                        </div>
                                        <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: '600' }}>
                                            {studentProfile.codechef_handle ? `@${studentProfile.codechef_handle}` : <span style={{ color: '#64748b' }}>Not linked</span>}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px' }}>
                                            Tier: <strong style={{ color: '#cbd5e1' }}>{studentProfile.codechef_stars || 'Unrated'}</strong>
                                        </div>
                                    </div>

                                    {/* 4. HackerRank */}
                                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ color: '#34d399', fontWeight: 'bold', fontSize: '0.95rem' }}>HackerRank</span>
                                            <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                                +{studentProfile.hackerrank_solved_month || 0} this mo
                                            </span>
                                        </div>
                                        <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: '600' }}>
                                            {studentProfile.hackerrank_handle ? `@${studentProfile.hackerrank_handle}` : <span style={{ color: '#64748b' }}>Not linked</span>}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px' }}>
                                            Score: <strong style={{ color: '#cbd5e1' }}>{studentProfile.hackerrank_score || 0}</strong>
                                        </div>
                                    </div>

                                    {/* 5. AtCoder */}
                                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: '0.95rem' }}>AtCoder</span>
                                            <span style={{ background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                                +{studentProfile.atcoder_solved_month || 0} this mo
                                            </span>
                                        </div>
                                        <div style={{ color: '#f8fafc', fontSize: '0.95rem', fontWeight: '600' }}>
                                            {studentProfile.atcoder_handle ? `@${studentProfile.atcoder_handle}` : <span style={{ color: '#64748b' }}>Not linked</span>}
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '6px' }}>
                                            Rating: <strong style={{ color: '#cbd5e1' }}>{studentProfile.atcoder_rating || 0}</strong>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Edit Mode: Coding Platform Inputs with Live Total Recalculation */
                                <div>
                                    <div style={{ background: 'rgba(37, 99, 235, 0.1)', border: '1px dashed #3b82f6', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#93c5fd', fontSize: '0.85rem' }}>
                                        💡 <strong>Live Dynamic Calculator:</strong> Modify the "Problems Solved This Month" values below. The total sum updates instantly and will be saved to your master database profile for all coordinators, mentors, and departments to see!
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                                        {/* LeetCode Edit */}
                                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <h5 style={{ color: '#f59e0b', fontSize: '0.9rem', marginBottom: '10px' }}>LeetCode Profile</h5>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Username Handle</label>
                                            <input
                                                type="text"
                                                value={profileFormData.leetcode_handle || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, leetcode_handle: e.target.value }))}
                                                placeholder="e.g. alex_coder"
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}
                                            />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Solved This Month 🔥</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.leetcode_solved_month !== undefined ? profileFormData.leetcode_solved_month : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, leetcode_solved_month: e.target.value }))}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Total Solved</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.leetcode_total_solved !== undefined ? profileFormData.leetcode_total_solved : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, leetcode_total_solved: e.target.value }))}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Codeforces Edit */}
                                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <h5 style={{ color: '#38bdf8', fontSize: '0.9rem', marginBottom: '10px' }}>Codeforces Profile</h5>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Username Handle</label>
                                            <input
                                                type="text"
                                                value={profileFormData.codeforces_handle || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, codeforces_handle: e.target.value }))}
                                                placeholder="e.g. alex_cf"
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}
                                            />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Solved This Month 🔥</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.codeforces_solved_month !== undefined ? profileFormData.codeforces_solved_month : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, codeforces_solved_month: e.target.value }))}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Rating</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.codeforces_rating !== undefined ? profileFormData.codeforces_rating : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, codeforces_rating: e.target.value }))}
                                                        placeholder="1200"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* CodeChef Edit */}
                                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <h5 style={{ color: '#fb923c', fontSize: '0.9rem', marginBottom: '10px' }}>CodeChef Profile</h5>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Username Handle</label>
                                            <input
                                                type="text"
                                                value={profileFormData.codechef_handle || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, codechef_handle: e.target.value }))}
                                                placeholder="e.g. alex_cc"
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}
                                            />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Solved This Month 🔥</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.codechef_solved_month !== undefined ? profileFormData.codechef_solved_month : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, codechef_solved_month: e.target.value }))}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Stars / Tier</label>
                                                    <input
                                                        type="text"
                                                        value={profileFormData.codechef_stars || ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, codechef_stars: e.target.value }))}
                                                        placeholder="e.g. 3-Star"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* HackerRank Edit */}
                                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <h5 style={{ color: '#34d399', fontSize: '0.9rem', marginBottom: '10px' }}>HackerRank Profile</h5>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Username Handle</label>
                                            <input
                                                type="text"
                                                value={profileFormData.hackerrank_handle || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, hackerrank_handle: e.target.value }))}
                                                placeholder="e.g. alex_hr"
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}
                                            />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Solved This Month 🔥</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.hackerrank_solved_month !== undefined ? profileFormData.hackerrank_solved_month : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, hackerrank_solved_month: e.target.value }))}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Score / Badges</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.hackerrank_score !== undefined ? profileFormData.hackerrank_score : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, hackerrank_score: e.target.value }))}
                                                        placeholder="450"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* AtCoder Edit */}
                                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', border: '1px solid #334155' }}>
                                            <h5 style={{ color: '#a78bfa', fontSize: '0.9rem', marginBottom: '10px' }}>AtCoder Profile</h5>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Username Handle</label>
                                            <input
                                                type="text"
                                                value={profileFormData.atcoder_handle || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, atcoder_handle: e.target.value }))}
                                                placeholder="e.g. alex_atc"
                                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}
                                            />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Solved This Month 🔥</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.atcoder_solved_month !== undefined ? profileFormData.atcoder_solved_month : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, atcoder_solved_month: e.target.value }))}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Rating</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={profileFormData.atcoder_rating !== undefined ? profileFormData.atcoder_rating : ''}
                                                        onChange={(e) => setProfileFormData(prev => ({ ...prev, atcoder_rating: e.target.value }))}
                                                        placeholder="800"
                                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ============================================================== */}
                        {/* SECTION 2: PERSONAL & CONTACT INFORMATION                      */}
                        {/* ============================================================== */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                            {/* Personal & Credential Details Card */}
                            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <h4 style={{ color: '#60a5fa', fontSize: '0.95rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    Personal Credentials & Contacts
                                </h4>

                                {!isEditingProfile ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', color: '#cbd5e1', fontSize: '0.88rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>Full Name</span>
                                            <strong style={{ color: '#fff' }}>{studentProfile.name}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>Phone Contact</span>
                                            <strong style={{ color: studentProfile.phone ? '#38bdf8' : '#64748b' }}>{studentProfile.phone || 'Not provided'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>Register Number</span>
                                            <strong style={{ color: '#60a5fa' }}>{studentProfile.register_number || 'N/A'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>Student Email</span>
                                            <strong style={{ color: '#fff' }}>{studentProfile.email || user.gmail}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>Department & Year</span>
                                            <strong style={{ color: '#fff' }}>{studentProfile.department || 'Not Assigned'} &bull; {studentProfile.year || '4th Year'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                                            <span style={{ color: '#94a3b8' }}>Social Profiles</span>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {studentProfile.linkedin_url && (
                                                    <a href={studentProfile.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', fontSize: '0.8rem', textDecoration: 'none' }}>LinkedIn &rarr;</a>
                                                )}
                                                {studentProfile.github_url && (
                                                    <a href={studentProfile.github_url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', fontSize: '0.8rem', textDecoration: 'none' }}>GitHub &rarr;</a>
                                                )}
                                                {studentProfile.portfolio_url && (
                                                    <a href={studentProfile.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', fontSize: '0.8rem', textDecoration: 'none' }}>Portfolio &rarr;</a>
                                                )}
                                                {!studentProfile.linkedin_url && !studentProfile.github_url && !studentProfile.portfolio_url && (
                                                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>None added</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Full Name</label>
                                            <input
                                                type="text"
                                                value={profileFormData.name || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, name: e.target.value }))}
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Phone Contact</label>
                                            <input
                                                type="text"
                                                value={profileFormData.phone || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, phone: e.target.value }))}
                                                placeholder="+91 98765 43210"
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                                                    <span>Department</span>
                                                    <span style={{ fontSize: '0.68rem', color: '#38bdf8' }}>🔒 Institutional</span>
                                                </label>
                                                <div style={{ padding: '7px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
                                                    {studentProfile.department || 'CSE'}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Academic Year</label>
                                                <input
                                                    type="text"
                                                    value={profileFormData.year || ''}
                                                    onChange={(e) => setProfileFormData(prev => ({ ...prev, year: e.target.value }))}
                                                    placeholder="4th Year"
                                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>LinkedIn URL</label>
                                            <input
                                                type="url"
                                                value={profileFormData.linkedin_url || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, linkedin_url: e.target.value }))}
                                                placeholder="https://linkedin.com/in/..."
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>GitHub Profile URL</label>
                                            <input
                                                type="url"
                                                value={profileFormData.github_url || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, github_url: e.target.value }))}
                                                placeholder="https://github.com/..."
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Academic Performance Card */}
                            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <h4 style={{ color: '#60a5fa', fontSize: '0.95rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                                    </svg>
                                    Academic Records & Verification
                                </h4>

                                {!isEditingProfile ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', color: '#cbd5e1', fontSize: '0.88rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>Cumulative CGPA</span>
                                            <strong style={{ color: '#34d399', fontSize: '1.05rem' }}>{studentProfile.cgpa !== null && studentProfile.cgpa !== undefined ? `${studentProfile.cgpa} / 10.0` : 'N/A'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>10th Percentage</span>
                                            <strong style={{ color: '#fff' }}>{studentProfile.tenth !== null && studentProfile.tenth !== undefined ? `${studentProfile.tenth}%` : 'N/A'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span style={{ color: '#94a3b8' }}>12th / Diploma %</span>
                                            <strong style={{ color: '#fff' }}>{studentProfile.twelfth !== null && studentProfile.twelfth !== undefined ? `${studentProfile.twelfth}%` : 'N/A'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: '#94a3b8' }}>Placement Status</span>
                                            <span style={{
                                                background: placedResult ? 'rgba(16, 185, 129, 0.2)' : myApplications.length > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                                                color: placedResult ? '#34d399' : myApplications.length > 0 ? '#60a5fa' : '#94a3b8',
                                                border: `1px solid ${placedResult ? 'rgba(16, 185, 129, 0.4)' : myApplications.length > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(148, 163, 184, 0.4)'}`,
                                                fontSize: '0.8rem',
                                                padding: '2px 10px',
                                                borderRadius: '12px',
                                                fontWeight: 'bold'
                                            }}>
                                                {placementStatus}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', border: '1px solid #334155' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cumulative CGPA</span>
                                                <span style={{ fontSize: '0.68rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 'bold' }}>
                                                    🔒 Verified by Placement Cell
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#34d399' }}>
                                                {studentProfile.cgpa !== null && studentProfile.cgpa !== undefined ? `${studentProfile.cgpa} / 10.0` : 'N/A'}
                                            </div>
                                            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                                                Official CGPA auto-updated via Placement Cell Excel Roster. Non-editable by students.
                                            </p>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', border: '1px solid #334155' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>10th Marks</span>
                                                    <span style={{ fontSize: '0.65rem', color: '#38bdf8' }}>🔒 Verified</span>
                                                </div>
                                                <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{studentProfile.tenth !== null && studentProfile.tenth !== undefined ? `${studentProfile.tenth}%` : 'N/A'}</strong>
                                            </div>
                                            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', border: '1px solid #334155' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>12th / Diploma</span>
                                                    <span style={{ fontSize: '0.65rem', color: '#38bdf8' }}>🔒 Verified</span>
                                                </div>
                                                <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{studentProfile.twelfth !== null && studentProfile.twelfth !== undefined ? `${studentProfile.twelfth}%` : 'N/A'}</strong>
                                            </div>
                                        </div>
                                        <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.74rem', color: '#93c5fd', lineHeight: '1.4' }}>
                                            🔒 <strong>Institutional Academic Records:</strong> CGPA, marks, and branch are verified official data imported by the Placement Coordinator.
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Technical Skills (comma-separated)</label>
                                            <input
                                                type="text"
                                                value={profileFormData.skills || ''}
                                                onChange={(e) => setProfileFormData(prev => ({ ...prev, skills: e.target.value }))}
                                                placeholder="Python, React, TypeScript, SQL..."
                                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ============================================================== */}
                        {/* SECTION 3: SKILLSET & RESUME DOCUMENT MANAGER                  */}
                        {/* ============================================================== */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                            {/* Skillset Badges */}
                            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <h4 style={{ color: '#60a5fa', fontSize: '0.95rem', marginBottom: '12px' }}>Technical Skillset & Stack</h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {(Array.isArray(studentProfile.skills) ? studentProfile.skills : (studentProfile.skills || '').split(',')).map((sk, idx) => (
                                        <span key={idx} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '5px 12px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: '500' }}>
                                            {sk.trim()}
                                        </span>
                                    ))}
                                    {(!studentProfile.skills || studentProfile.skills.length === 0) && (
                                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No skills listed yet. Click edit to add your stack.</span>
                                    )}
                                </div>
                            </div>

                            {/* Resume Document Upload & Download */}
                            <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <h4 style={{ color: '#60a5fa', fontSize: '0.95rem', marginBottom: '12px' }}>Resume Document Manager</h4>
                                
                                {studentProfile.resume_url ? (
                                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 16px', borderRadius: '8px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '0.85rem' }}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8"></polyline>
                                            </svg>
                                            <span>Active Resume: <strong>{studentProfile.resume_filename || 'Candidate_Resume.pdf'}</strong></span>
                                        </div>
                                        <a
                                            href={studentProfile.resume_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                background: '#10b981',
                                                color: '#ffffff',
                                                textDecoration: 'none',
                                                fontSize: '0.8rem',
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            View / Download &darr;
                                        </a>
                                    </div>
                                ) : (
                                    <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '14px' }}>
                                        No resume uploaded yet. Upload your PDF or Word resume so placement coordinators and mentors can review it anytime.
                                    </div>
                                )}

                                <form onSubmit={handleResumeUploadSubmit}>
                                    <div style={{ marginBottom: '12px' }}>
                                        <input
                                            type="file"
                                            accept=".pdf,.doc,.docx"
                                            onChange={(e) => setResumeFile(e.target.files[0])}
                                            style={{ color: '#cbd5e1', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={uploadingResume || !resumeFile}
                                        style={{ padding: '8px 16px', borderRadius: '6px', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
                                    >
                                        {uploadingResume ? 'Uploading Resume...' : 'Upload Updated Resume'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
