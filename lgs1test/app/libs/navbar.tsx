

import Link from "next/link";

const Navbar =()=>{
  const navbarData = [
    {name:'Home', path:'/'},
    {name:'blog', path:'/blog'},
    {name:'Questions', path:'/questions'},
    {name:'Methods', path:'/methods'},
    {name:'About', path:'/about'},
    {name:'Thanks', path:'/thanks'},
  ]
    return (
    <>
        {
            navbarData.map((item)=>{
                return (
                    <Link key={item.name} href={item.path}>
                        {item.name}
                    </Link>
                )
                
            })
        }
    </>
  )
}

export default Navbar


