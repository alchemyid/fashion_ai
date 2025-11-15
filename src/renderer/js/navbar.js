// Load navbar and set active menu
async function loadNavbar(currentPage) {
    const response = await fetch('components/navbar.html');
    const html = await response.text();
    document.querySelector('.dashboard-layout').insertAdjacentHTML('afterbegin', html);

    // Set active menu
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.dataset.page === currentPage) {
            item.classList.add('active');

            // If it's a submenu item, expand the parent
            if (item.closest('.nav-submenu')) {
                const parent = item.closest('.nav-submenu').previousElementSibling;
                parent.classList.add('expanded', 'active');
                item.closest('.nav-submenu').classList.add('expanded');
            }
        }
    });

    // Set username
    const username = localStorage.getItem('username') || 'Admin';
    document.getElementById('userName').textContent = username;
}

function toggleSubmenu(element) {
    element.classList.toggle('expanded');
    const submenu = element.nextElementSibling;
    submenu.classList.toggle('expanded');
}

function logout() {
    // Only remove logged_in status, keep remember_me and credentials if checked
    localStorage.removeItem('logged_in');
    window.location.href = 'index.html';
}


// Check authentication
if (!localStorage.getItem('logged_in')) {
    window.location.href = 'index.html';
}
