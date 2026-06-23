document.addEventListener('DOMContentLoaded', () => {
    // Simulated Operator Data (from SRS/SDS)
    const operators = [
        { name: 'Munir Ahmed', role: 'Traveler', status: 'Active', joins: '2 mins ago' },
        { name: 'Serena Hotel', role: 'Hotel_Owner', status: 'Active', joins: '15 mins ago' },
        { name: 'Khyber Transport', role: 'Transport_Provider', status: 'Pending', joins: '1 hour ago' },
        { name: 'The Monal', role: 'Restaurant_Owner', status: 'Active', joins: '3 hours ago' },
        { name: 'Meer Jaan', role: 'Traveler', status: 'Deactivated', joins: '1 day ago' }
    ];

    const operatorList = document.getElementById('operators-list');
    
    operators.forEach(op => {
        const row = document.createElement('tr');
        const roleIcon = getRoleIcon(op.role);
        const statusColor = op.status === 'Active' ? '#2dce89' : (op.status === 'Pending' ? '#ffad00' : '#D32F2F');
        
        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: #f0f0ff; display: flex; align-items: center; justify-content: center; color: #6A1B9A;">
                        <i class="${roleIcon}"></i>
                    </div>
                    <div>
                        <div style="font-weight: 600; font-size: 0.9rem;">${op.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${op.role.replace('_', ' ')}</div>
                    </div>
                </div>
            </td>
            <td>
                <span style="font-size: 0.8rem; color: ${statusColor}; font-weight: 600;">
                    <i class="fas fa-circle" style="font-size: 0.5rem; margin-right: 4px;"></i>
                    ${op.status}
                </span>
            </td>
            <td style="color: var(--text-muted); font-size: 0.85rem; text-align: right;">${op.joins}</td>
        `;
        operatorList.appendChild(row);
    });

    function getRoleIcon(role) {
        switch(role) {
            case 'Hotel_Owner': return 'fas fa-hotel';
            case 'Restaurant_Owner': return 'fas fa-utensils';
            case 'Transport_Provider': return 'fas fa-bus';
            case 'Admin': return 'fas fa-user-shield';
            default: return 'fas fa-user';
        }
    }

    // Number Counting Animation
    const animateValue = (id, start, end, duration) => {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const val = Math.floor(progress * (end - start) + start);
            obj.innerHTML = val.toLocaleString() + (id === 'val-budget' ? 'M+' : '');
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    };

    animateValue('count-users', 0, 4821, 1500);
    animateValue('count-listings', 0, 1250, 1500);
    animateValue('count-trips', 0, 892, 1500);
    animateValue('val-budget', 0, 2, 1500);

    // Widget Entry Animation
    const widgets = document.querySelectorAll('.widget');
    widgets.forEach((w, i) => {
        w.style.opacity = '0';
        w.style.transform = 'translateY(20px)';
        setTimeout(() => {
            w.style.transition = 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
            w.style.opacity = '1';
            w.style.transform = 'translateY(0)';
        }, i * 100);
    });
});
