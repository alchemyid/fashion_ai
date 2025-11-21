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
                item.closest('.nav-submenu').style.maxHeight = item.closest('.nav-submenu').scrollHeight + "px";
            }
        }
    });

    // Set username
    const username = localStorage.getItem('username') || 'Admin';
    document.getElementById('userName').textContent = username;
}

function toggleSubmenu(element) {
    // Close all other submenus first (Accordion behavior)
    const allParents = document.querySelectorAll('.nav-item-parent');
    allParents.forEach(parent => {
        if (parent !== element && parent.classList.contains('expanded')) {
            parent.classList.remove('expanded');
            const submenu = parent.nextElementSibling;
            submenu.classList.remove('expanded');
            submenu.style.maxHeight = null;
        }
    });

    // Toggle current
    element.classList.toggle('expanded');
    const submenu = element.nextElementSibling;
    submenu.classList.toggle('expanded');

    if (submenu.style.maxHeight) {
        submenu.style.maxHeight = null;
    } else {
        submenu.style.maxHeight = submenu.scrollHeight + "px";
    }
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